const fs = require('fs')
const config = require('config')
const _ = require('lodash')
const elasticsearch = require('elasticsearch')
const esConfig = config.get('elasticsearch')
const es_client = new elasticsearch.Client({
    host: (process.env['ES_HOST']||esConfig.host) + ":" + esConfig.port,
    httpAuth:esConfig.user +":" + esConfig.password,
    requestTimeout: esConfig.requestTimeout
})
const scirichonSchema = require('scirichon-json-schema')
const readline = require('readline')

const generateMapping = ()=>{
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
    if(process.env['ES_PINYIN']==1){
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
    return templateMapping
}


const initElasticSearchSchema = async ()=>{
    let templateMapping = generateMapping()
    let route_schemas = scirichonSchema.getApiRouteSchemas()
    let categories = process.env['ES_CATEGORIES']?process.env['ES_CATEGORIES'].split(','):_.map(route_schemas,(schema)=>schema.id)
    for(let schema of route_schemas){
        if(schema.service===process.env['NODE_NAME']&&schema.search&&schema.search.index&&categories.includes(schema.id)){
            await rebuildIndex(schema,templateMapping)
            console.log(`add ${schema.id} mapping in es success!`)
        }
    }
}

const rebuildIndex = async (schema,defaultMapping)=>{
    let index=schema.search.index,category=schema.id
    try{
        await es_client.indices.delete({index:[index]})
    }catch(error){

    }
    await es_client.indices.create({index: index, body: defaultMapping})
    if(schema.search.mapping){
        await es_client.indices.putMapping({index,type:'doc',body:schema.search.mapping})
    }
}

const promptInit = async ()=>{
    return new Promise((resolve,reject)=>{
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        console.log('if es is not empty you need to run json-export first!')
        rl.question('Warning:data in es will be lost! Continue to run?(y/n)', async (answer) => {
            if(answer==='y'||answer==='Y'||answer==='yes'||answer==='YES'){
                await initElasticSearchSchema()
            }
            rl.close()
            resolve()
        });
    })
}


const initialize = async ()=>{
    const option = {redisOption:config.get('redis'),prefix:process.env['SCHEMA_TYPE']}
    await scirichonSchema.loadSchemas(option)
    await promptInit()
}

module.exports = {initialize}

