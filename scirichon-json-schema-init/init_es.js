const config = require('config')
const _ = require('lodash')
const esConfig = config.get('elasticsearch')
const { Client } = require('@elastic/elasticsearch')
const es_client = new Client({
    node: 'http://' + (process.env['ES_HOST']||esConfig.host) + ":" + esConfig.port,
    auth:{
        username:esConfig.user,
        password:esConfig.password
    },
    requestTimeout: esConfig.requestTimeout
})
const scirichonSchema = require('scirichon-json-schema')
const readline = require('readline')

const generateDefaultTpl = ()=>{
    let template =
        {
            "mappings": {
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
                            "unmatch": "*_chinese",
                            "mapping": {
                                "type": "keyword"
                            }
                        }
                    }
                ]
            }
        }
    if(process.env['ES_PINYIN']==1){
        template.settings = {
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
        template.mappings.dynamic_templates.push({
            "chinese_as_pinyin": {
                "match_pattern": "regex",
                "match":   ".*_pinyin_chinese$",
                "mapping": {
                    "type": "text",
                    "analyzer": "pinyin_analyzer",
                    "fielddata": true
                }
            }
        })
    }
    if(process.env['ES_IK']==1){
        template.mappings.dynamic_templates.push({
            "chinese_as_ik": {
                "match_pattern": "regex",
                "match":   ".*_ik_chinese$",
                "mapping": {
                    "type": "text",
                    "analyzer": "ik_max_word",
                    "search_analyzer": "ik_smart"
                }
            }
        })
    }
    return template
}


const initElasticSearchSchema = async ()=>{
    let templateMapping = generateDefaultTpl()
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
        await es_client.indices.putMapping({index,body:schema.search.mapping})
    }
}

const init = async () => {
    if (process.env['NODE_ENV'] == 'production') {
        return new Promise((resolve, reject) => {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            console.log('if es is not empty you need to run json-export first!')
            rl.question('Warning:data in es will be lost! Continue to run?(y/n)', async (answer) => {
                if (answer === 'y' || answer === 'Y' || answer === 'yes' || answer === 'YES') {
                    await initElasticSearchSchema()
                }
                rl.close()
                resolve()
            })
        })
    } else {
        await initElasticSearchSchema()
    }
}


const initialize = async ()=>{
    const option = {redisOption:config.get('redis'),prefix:process.env['SCHEMA_TYPE']}
    await scirichonSchema.loadSchemas(option)
    await init()
}

module.exports = {initialize}

