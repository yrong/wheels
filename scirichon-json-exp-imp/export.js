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
    let base_url = common.getServiceApiUrl(route_schema.service),result,items,total_page
    result = await common.apiInvoker('GET',base_url,route_schema.route,{page:1})
    if(result&&result.data&&result.data.count){
        total_page = Math.ceil((result.data.count)/(config.get('perPageSize')))+1
    }
    for(let page = 1;page<total_page;page++){
        result = await common.apiInvoker('GET',base_url,route_schema.route,{page,original:true})
        items = result&&result.data&&result.data.results
        if(items.length){
            items = _.map(items,(item)=>{
                item = _.omit(item,'id')
                item.category = item.category||route_schema.id
                return item
            })
            jsonfile.writeFileSync(path.join(exportDir, `${route_schema.id}-${page}.json`), items, {spaces: 2})
            console.log(`page ${page} of ${route_schema.id} exported`)
        }
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

