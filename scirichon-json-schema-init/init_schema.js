const config = require('config')
const _ = require('lodash')
const scirichonSchema = require('scirichon-json-schema')


const initJsonSchema = async ()=>{
    const option = {redisOption:config.get('redis'),prefix:process.env['SCHEMA_TYPE']}
    await scirichonSchema.initSchemas(option)
    console.log("load schema to redis success!")
}

const initialize = async ()=>{
    await initJsonSchema()
}

module.exports = {initialize}

