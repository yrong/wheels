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

const wrapRequest = (category,item) => {
    return {data:{category:category,fields:item},batchImport:true,jsonImport:true}
}

const isSchemaCrossed = (category1, category2)=>{
    return _.intersection(scirichonSchema.getParentCategories(category1),scirichonSchema.getParentCategories(category2)).length>0
}

const getSortedCategories = ()=>{
    let schemas = scirichonSchema.getApiRouteSchemas(),sortedCategories
    for(let schema of schemas){
        setSchemaOrder(schema.id)
    }
    schemas = _.sortBy(schemas, ['order'])
    sortedCategories = _.map(schemas,(schema)=>schema.id)
    return sortedCategories
}

const setSchemaOrder = (category)=>{
    let schema = scirichonSchema.getSchema(category),ref_schema,ref_order,max_ref_order=0,refs
    if(!schema.order){
        refs = scirichonSchema.getSchemaRefProperties(schema.id)
        if(refs.length){
            for(let ref of refs){
                if(!ref.schema)
                    throw new Error(`${category} reference field not valid,${JSON.stringify(ref)}`)
                if(ref.schema===schema.id)
                    continue
                ref_schema = scirichonSchema.getSchema(ref.schema)
                if(!ref_schema){
                    throw new Error(`${category} reference field not valid,${JSON.stringify(ref)}`)
                }
                ref_order = setSchemaOrder(ref_schema.id)
                max_ref_order = ref_order>max_ref_order?ref_order:max_ref_order
            }
            schema.order = max_ref_order+1
        }else{
            schema.order = 1
        }
    }
    return schema.order
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
        route = category_schema&&category_schema.route,base_url
    if(!route)
        throw new Error(`${category} api route not found`)
    base_url = common.getServiceApiUrl(category_schema.service)
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
    categories = getSortedCategories()
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
                        await addItem(item.category||category, item)
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



