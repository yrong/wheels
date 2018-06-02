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
    let es_schema_dir = `./search`,files = fs.readdirSync(es_schema_dir),categories=[]
    for(let fileName of files){
        if(fileName.endsWith('.json')){
            categories.push(fileName.slice(0, -5))
        }
    }
    let schema_promise = (category)=>{
        return new Promise((resolve,reject)=>{
            es_client.indices.delete({index:[category]},(err)=>{
                es_client.indices.create({index:category,body:JSON.parse(fs.readFileSync(`${es_schema_dir}/${category}.json`, 'utf8'))},(err)=>{
                    if(err){
                        console.log(err.stack||err)
                    }
                    else{
                        resolve()
                    }
                })
            })
        })
    }
    for(let category of categories){
        await schema_promise(category)
    }
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

}

const initJsonSchema = async ()=>{
    let json_schema_dir = `./schema`
    let files = fs.readdirSync(json_schema_dir),schma_obj,
        redisOption = {host:`${process.env['REDIS_HOST']||config.get('redis.host')}`,port:config.get('redis.port')}
    scirichonSchema.initialize({redisOption,prefix:process.env['SCHEMA_TYPE']})
    for(let fileName of files){
        if(fileName.endsWith('.json')){
            schma_obj = JSON.parse(fs.readFileSync(json_schema_dir + '/' + fileName, 'utf8'))
            scirichonSchema.checkSchema(schma_obj)
            await scirichonSchema.persitSchema(schma_obj)
        }
    }
    await scirichonSchema.loadSchemas()
}

const initialize = async ()=>{
    await initJsonSchema()
    await initNeo4jConstraints()
    if(process.env['INIT_ES'])
        await initElasticSearchSchema()
}

initialize().then((schemas)=>{
    console.log('intialize schema success!')
    process.exit(0)
}).catch(err=>console.log(err.stack||err))

