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
    let result = await common.apiInvoker('GET',base_url,route_schema.route,{original:true})
    let items = result.data||result
    if(items&&items.length){
        items = _.map(items,(item)=>{
            item = _.omit(item,'id')
            item.category = item.category||route_schema.id
            return item
        })
        jsonfile.writeFileSync(path.join(exportDir, `${route_schema.id}.json`), items, {spaces: 2})
    }
}

const exportItems = async ()=>{
    let schema_type = process.env['SCHEMA_TYPE'],categories,schemas,
        redisOption = config.get('redis'),
        timestamp = moment().format('YYYYMMDDHHmmss'),
        json_export_dir = `/${schema_type}/export`,
        exportDir = path.join((process.env['RUNTIME_PATH']||'../runtime') + json_export_dir, timestamp),
        routes,route,exported=[]
    mkdirp.sync(exportDir)
    await schema.loadSchemas({redisOption,prefix:schema_type})
    schemas = await schema.getSchemas()
    categories = process.env['CATEGORIES']?process.env['CATEGORIES'].split(','):_.map(schemas,(schema)=>schema.id)
    routes = schema.getApiRouteSchemas()
    for(route of routes){
        if(route.service===process.env['NODE_NAME']&&categories.includes(route.id)){
            exported.push(route.id)
            await exportItemsByCategory(route,exportDir)
        }
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

