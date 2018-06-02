#!/usr/bin/env node

const config = require('config')
const jsonfile = require('jsonfile')
const path = require('path')
const moment = require('moment')
const _ = require('lodash')
const mkdirp = require('mkdirp')
const schema = require('scirichon-json-schema')
const common = require('scirichon-common')

const exportItemsByCategory = async(route_schema,exportDir)=>{
    let base_url = common.getServiceApiUrl(route_schema.service)
    let result = await common.apiInvoker('GET',base_url,`/api${route_schema.route}`,{original:true})
    let items = result.data||result
    items = _.map(items,(item)=>{
        item = _.omit(item,'id')
        item.category = item.category||route_schema.id
        return item
    })
    if (items && items.length) {
        jsonfile.writeFileSync(path.join(exportDir, `${route_schema.id}.json`), items, {spaces: 2});
    }
}

const exportItems = async ()=>{
    let schema_type = process.env['SCHEMA_TYPE'],categories,
        redisOption = {host:`${process.env['REDIS_HOST']||config.get('redis.host')}`,port:config.get('redis.port')},
        timestamp = moment().format('YYYYMMDDHHmmss'),
        json_export_dir = `runtime_data.${schema_type}.json_export_dir`,
        exportDir = path.join((process.env['RUNTIME_PATH']||'../runtime') + config.get(json_export_dir), timestamp),
        routes,route,exported=[]
    mkdirp.sync(exportDir)
    await schema.loadSchemas({redisOption,prefix:schema_type})
    routes = schema.getApiRouteSchemas()
    for(route of routes){
        exported.push(route.id)
        await exportItemsByCategory(route,exportDir)
    }
    return {directory: exportDir,category:exported}
}

if (require.main === module) {
    exportItems().then((result)=>{
        console.log(JSON.stringify(result,null,'\t'))
        process.exit()
    }).catch(err=>{
        console.log(err.stack)
    })
}

module.exports = exportItems

