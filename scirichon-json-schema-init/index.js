#!/usr/bin/env node

const fs = require('fs')
const config = require('config')
const neo4j = require('neo4j-driver').v1
const neo4jConfig = config.get('neo4j')
const neo4jDriver = neo4j.driver("bolt://"+(process.env['NEO4J_HOST']||neo4jConfig.host)+":"+neo4jConfig.port, neo4j.auth.basic(process.env['NEO4J_USER']||neo4jConfig.user, process.env['NEO4J_PASSWD']||neo4jConfig.password))
const {parse} = require('parse-neo4j-fork')
const _ = require('lodash')
const elasticsearch = require('elasticsearch')
const esConfig = config.get('elasticsearch')
const es_client = new elasticsearch.Client({
    host: (process.env['ES_HOST']||esConfig.host) + ":" + esConfig.port,
    httpAuth:esConfig.user +":" + esConfig.password,
    requestTimeout: esConfig.requestTimeout
})
const scirichonSchema = require('scirichon-json-schema')

const executeCypher = (cql,params)=>{
    return new Promise((resolve, reject) => {
        const session = neo4jDriver.session()
        session.run(cql, params)
            .then(result => {
                session.close()
                resolve(parse(result))
            })
            .catch(error => {
                session.close()
                error = error.fields ? JSON.stringify(error.fields[0]) : String(error)
                reject(`error while executing Cypher: ${error}`)
            });
    })
}

const initElasticSearchSchema = async ()=>{
    let templateMapping =
    {
        "mappings": {
            "doc": {
                "dynamic_templates": [
                    {
                        "string_as_date": {
                            "match_pattern": "regex",
                            "match":   ".*_date$|.*_time$|created|lastUpdated",
                            "mapping": {
                                "type": "date"
                            }
                        }
                    },
                    {
                        "string_as_keyword": {
                            "match_mapping_type": "string",
                            "unmatch": "*_pinyin",
                            "mapping": {
                                "type": "keyword"
                            }
                        }
                    }
                ]
            }
        }
    }
    if(process.env['PINYIN']==="1"){
        templateMapping.settings = {
            "analysis" : {
                "analyzer" : {
                    "pinyin_analyzer" : {
                        "tokenizer" : "my_pinyin"
                    }
                },
                "tokenizer" : {
                    "my_pinyin" : {
                        "type" : "pinyin",
                        "keep_full_pinyin":false
                    }
                }
            }
        }
        templateMapping.mappings.doc.dynamic_templates.push({
            "string_as_pinyin": {
                "match_pattern": "regex",
                "match":   ".*_pinyin$",
                "mapping": {
                    "type": "text",
                    "analyzer": "pinyin_analyzer",
                    "fielddata": true
                }
            }
        })
    }
    let schemas = await scirichonSchema.loadSchemas()
    let route_schemas = scirichonSchema.getApiRouteSchemas()
    for(let route_schema of route_schemas){
        if(route_schema.search&&route_schema.search.index){
            let rebuildIndex = (index)=>{
                let mappingFile = `./search/${index}.json`
                return new Promise((resolve,reject)=>{
                    es_client.indices.delete({index:[index]},(err)=>{
                        let mappingBody = fs.existsSync(mappingFile)?JSON.parse(fs.readFileSync(mappingFile, 'utf8')):templateMapping
                        es_client.indices.create({
                            index: index,
                            body: mappingBody
                        }, (err) => {
                            if (err) {
                                console.log(err.stack || err)
                            }
                            else {
                                resolve()
                            }
                        })
                    })
                })
            }
            await rebuildIndex(route_schema.search.index)
        }
    }
    console.log("add mapping in es success!")
}

const initNeo4jConstraints = async ()=>{
    const schemas = scirichonSchema.getSchemas()
    for(let category of _.keys(schemas)){
        let uniqueKeys = schemas[category].uniqueKeys
        if(uniqueKeys){
            for(let field of uniqueKeys){
                await executeCypher(`CREATE CONSTRAINT ON (n:${category}) ASSERT n.${field} IS UNIQUE`)
            }
        }
        await executeCypher(`CREATE CONSTRAINT ON (n:${category}) ASSERT n.unique_name IS UNIQUE`)
    }
    console.log("add constraint in neo4j success!")
}

const initJsonSchema = async ()=>{
    let json_schema_dir = `./schema`
    let files = fs.readdirSync(json_schema_dir),schma_obj,
        redisOption = config.get('redis')
    scirichonSchema.initialize({redisOption,prefix:process.env['SCHEMA_TYPE']})
    for(let fileName of files){
        if(fileName.endsWith('.json')){
            schma_obj = JSON.parse(fs.readFileSync(json_schema_dir + '/' + fileName, 'utf8'))
            scirichonSchema.checkSchema(schma_obj)
            await scirichonSchema.persitSchema(schma_obj)
        }
    }
    await scirichonSchema.loadSchemas()
    console.log("load schema to redis success!")
}

const initialize = async ()=>{
    await initJsonSchema()
    await initNeo4jConstraints()
    if(process.env['INIT_ES']==="1")
        await initElasticSearchSchema()
}

initialize().then((schemas)=>{
    process.exit(0)
}).catch(err=>console.log(err.stack||err))

