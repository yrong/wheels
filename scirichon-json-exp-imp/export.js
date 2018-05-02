#!/usr/bin/env node

const config = require('config')
const jsonfile = require('jsonfile')
const path = require('path')
const moment = require('moment')
const _ = require('lodash')
const mkdirp = require('mkdirp')
const schema = require('scirichon-json-schema')
const common = require('scirichon-common')

const exportItemsByCategory = async(category,exportDir)=>{
    let node_name = process.env['NODE_NAME'], base_url=common.getServiceApiUrl(node_name)
    let result = await common.apiInvoker('POST',base_url,'/api/searchByCypher',{original:true},{category,cypher:`MATCH (n) WHERE n:${category} RETURN n`})
    let items = result.data||result
    items = _.map(items,(item)=>(_.omit(item,'id')))
    if (items && items.length) {
        jsonfile.writeFileSync(path.join(exportDir, `${category}.json`), items, {spaces: 2});
    }
}

const exportItems = async ()=>{
    let node_name = process.env['NODE_NAME'],categories,
        redisOption = {host:`${process.env['REDIS_HOST']||config.get('redis.host')}`,port:config.get('redis.port')},
        timestamp = moment().format('YYYYMMDDHHmmss'),
        json_export_dir = `runtime_data.${node_name}.json_export_dir`,
        exportDir = path.join((process.env['RUNTIME_PATH']||'../runtime') + config.get(json_export_dir), timestamp)
    await schema.loadSchemas({redisOption,prefix:node_name})
    categories = _.map(schema.getApiRouteSchemas(),(schema)=>schema.id)
    mkdirp.sync(exportDir)
    categories.push('Department')
    categories.push('User')
    categories.push('Role')
    if(node_name==='vehicle'){
        categories.push('CompoundModel')
        categories.push('OrderHistory')
        categories.push('StatisticOrder')
    }
    for(let category of categories){
        await exportItemsByCategory(category,exportDir)
    }
    return {directory: exportDir,categories}
}

if (require.main === module) {
    exportItems().then((result)=>{
        console.log(JSON.stringify(result,null,'\t'))
        process.exit()
    }).catch(err=>{
        console.log(err)
    })
}

module.exports = exportItems

