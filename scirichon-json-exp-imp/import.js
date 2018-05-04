#!/usr/bin/env node

const jsonfile = require('jsonfile')
const _ = require('lodash')
const path = require('path')
const fs = require('fs')
const config = require('config')
const scirichonSchema = require('scirichon-json-schema')
const scirichonSearch = require('scirichon-search')
const common = require('scirichon-common')
const scirichonCache = require('scirichon-cache')

let base_url= common.getServiceApiUrl(process.env['NODE_NAME'])

const wrapRequest = (category,item) => {
    return {data:{category:category,fields:item},batchImport:true,jsonImport:true}
}

const isSchemaCrossed = (category1, category2)=>{
    return _.intersection(scirichonSchema.getParentCategories(category1),scirichonSchema.getParentCategories(category2)).length>0
}

const getSortedCategories = ()=>{
    let sortedCategories = []
    if(process.env['NODE_NAME']==='vehicle') {
        sortedCategories = ['Warehouse','Brand','Model','Style','Exterior','Interior','Order','Vehicle','VehicleTrans']
    }else if(process.env['NODE_NAME']==='cmdb'){
        sortedCategories = ['ServerRoom','Cabinet','WareHouse','Shelf','ITServiceGroup','ITService','ConfigurationItem','ProcessFlow']
    }
    return sortedCategories
}

const sortItemsDependentFirst = (items)=>{
    if(!items||items.length==0)
        return items
    let dependent_items = [],refProperties = scirichonSchema.getSchemaRefProperties(items[0].category),propertyVal
    for (let item of items){
        let selfReference=false
        for(let refProperty of refProperties){
            propertyVal = item[refProperty['attr']]
            if(propertyVal){
                if(isSchemaCrossed(refProperty['schema'],item.category)){
                    selfReference = true
                    break
                }
            }
        }
        if(!selfReference)
            dependent_items.push(item)
    }
    let other_items = []
    for (let item of items){
        let found = false
        for (let dependent_item of dependent_items){
            if(item.uuid === dependent_item.uuid){
                found = true
                break
            }
        }
        if(!found)
            other_items.push(item)
    }
    return [...dependent_items,...other_items]
}

const itemPreprocess = (item)=>{
    return common.pruneEmpty(item)
}

const addItem = async (category,item,update)=>{
    let category_schema = scirichonSchema.getAncestorSchema(category),method='POST',uri,
        route = category_schema&&category_schema.route
    if(!route)
        throw new Error(`${category} api route not found`)
    uri = base_url  + '/api' + route
    if(update){
        method = 'PATCH'
        uri = uri + "/" + item.uuid
    }
    return await common.apiInvoker(method,uri,'','',wrapRequest(category,item))
}

const initializeComponents = async ()=>{
    let redisOption = {host:`${process.env['REDIS_HOST']||config.get('redis.host')}`,port:config.get('redis.port')},
        additionalPropertyCheck = config.get('additionalPropertyCheck'),NODE_NAME=process.env['NODE_NAME']
    let schema_option = {redisOption,additionalPropertyCheck,prefix:NODE_NAME}
    await scirichonSchema.initialize(schema_option)
    await scirichonCache.initialize(schema_option)
    await scirichonSearch.initialize(schema_option)
}

const importItems = async ()=>{
    await initializeComponents()
    let cypher, data_dir = process.env.IMPORT_FOLDER,importStrategy = process.env.IMPORT_STRATEGY||'api',
        categories = [],result = {},filePath,errorFolder,errorFilePath,errorItems,items,schema_obj,index_name,objectFields
    if(!data_dir)
        throw new Error(`env 'IMPORT_FOLDER' not defined`)
    categories.push('Department')
    categories.push('Role')
    categories.push('User')
    if(process.env['NODE_NAME']==='vehicle') {
        categories.push('CompoundModel')
    }
    categories = categories.concat(getSortedCategories())
    if(process.env['NODE_NAME']==='vehicle'){
        categories.push('OrderHistory')
        categories.push('StatisticOrder')
    }
    for(let category of categories){
        filePath = path.join(data_dir,category + '.json')
        errorFolder = path.join(data_dir,'exception')
        errorFilePath = path.join(errorFolder,category + '.json')
        errorItems = []
        if(fs.existsSync(filePath)){
            items = jsonfile.readFileSync(filePath)
            items = sortItemsDependentFirst(items)
            for (let item of items) {
                if(!item.category)
                    item.category = category
                try {
                    item = itemPreprocess(item)
                    if(importStrategy === 'api'){
                        if (category==='StatisticOrder'||category==='OrderHistory'||category==='Department'||category==='User'||category==='Role'||category==='CompoundModel'){
                            await scirichonCache.addItem(item)
                            if(category==='StatisticOrder'||category==='OrderHistory'){
                                await scirichonSearch.addOrUpdateItem(item,false,true)
                            }else{
                                await scirichonSearch.addOrUpdateItem(item)
                            }
                            objectFields=scirichonSchema.getSchemaObjectProperties(category)
                            for (let key of objectFields) {
                                if (_.isObject(item[key])) {
                                    item[key] = JSON.stringify(item[key])
                                }
                            }
                            category = category==='OrderHistory'?'StatisticOrder':category
                            cypher = `MERGE (n:${category}{uuid: {uuid}})
                                    ON CREATE SET n = {item}
                                    ON MATCH SET n = {item}`
                            await common.apiInvoker('POST',base_url,'/api/searchByCypher',{original:true},{category,cypher,item,uuid:item.uuid})
                            if(category==='Department'&&item.parent){
                                cypher = `MATCH (n:Department{uuid: {uuid}})
                                    MATCH (p:Department{uuid: {parent}})
                                    MERGE (n)-[:MemberOf]->(p)`
                                await common.apiInvoker('POST',base_url,'/api/searchByCypher',{original:true},{category,cypher,uuid:item.uuid,parent:item.parent})
                            }
                        }else{
                            await addItem(item.category||category, item)
                        }
                    }
                    else if(importStrategy === 'search'){
                        if(category==='StatisticOrder'||category==='OrderHistory'){
                            await scirichonSearch.addOrUpdateItem(item,false,true)
                        }else{
                            await scirichonSearch.addOrUpdateItem(item)
                        }
                    }
                    else
                        throw new Error('unknown importStrategy')
                }catch(error){
                    item.error = String(error)
                    errorItems.push(item)
                }
            }
            if(errorItems.length){
                if (!fs.existsSync(errorFolder))
                    fs.mkdirSync(errorFolder)
                jsonfile.writeFileSync(errorFilePath, errorItems, {spaces: 2})
            }
        }
        result[category] = {errorItems}
    }
    return result
}

if (require.main === module) {
    importItems().then((result)=>{
        console.log(JSON.stringify(result,null,'\t'))
        process.exit()
    }).catch(err=>{
        console.log(err)
    })
}

module.exports = importItems



