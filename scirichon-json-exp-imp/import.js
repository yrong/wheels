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
    return {data:{category:category,fields:item},procedure:{ignoreNotification:true,ignoreUniqueCheck:true,ignoreCustomizedHandler:true}}
}

const isSchemaCrossed = (category1, category2)=>{
    return _.intersection(scirichonSchema.getParentCategories(category1),scirichonSchema.getParentCategories(category2)).length>0
}

const isSchemaSearchUpsert = (category)=>{
    let schema_obj = scirichonSchema.getAncestorSchema(category)
    return schema_obj&&schema_obj.search&&schema_obj.search.upsert
}

const getSchemaIndex = (category)=>{
    let schema_obj = scirichonSchema.getAncestorSchema(category)
    return schema_obj&&schema_obj.search&&schema_obj.search.index
}

const getSortedCategories = ()=>{
    let schemas = scirichonSchema.getApiRouteSchemas(),sortedCategories
    for(let schema of schemas){
        setSchemaOrder(schema.id)
    }
    schemas = _.sortBy(schemas, ['order'])
    schemas = _.filter(schemas,schema=>schema.service===process.env['NODE_NAME'])
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
    let dependent_items = [],dependent_ids = [],refProperties = scirichonSchema.getSchemaRefProperties(items[0].category),propertyVal,other_items
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
        if(!selfReference){
            dependent_items.push(item)
            dependent_ids.push(item.uuid)
        }
    }
    other_items = _.filter(items,(item)=>{
        return !_.includes(dependent_ids,item.uuid)
    })
    return [...dependent_items,...other_items]
}

const itemsPreprocess = (items,category)=>{
    return _.each(items,(item)=>{
        if (!item.category)
            item.category = category
        return common.pruneEmpty(item)
    })
}


const addItem = async (category,item,update)=>{
    let category_schema = scirichonSchema.getAncestorSchema(category),method='POST',uri
    if(!category_schema||!category_schema.route||!category_schema.service)
        throw new Error(`${category} api route not valid`)
    uri = common.getServiceApiUrl(category_schema.service) + category_schema.route
    if(update){
        method = 'PATCH'
        uri = uri + "/" + item.uuid
    }
    return await common.apiInvoker(method,uri,'','',wrapRequest(category,item))
}

const initializeComponents = async ()=>{
    let redisOption = config.get('redis'),
        additionalPropertyCheck = config.get('additionalPropertyCheck'),SCHEMA_TYPE=process.env['SCHEMA_TYPE']
    let schema_option = {redisOption,additionalPropertyCheck,prefix:SCHEMA_TYPE}
    await scirichonSchema.initialize(schema_option)
    await scirichonCache.initialize(schema_option)
}

const importItems = async () => {
    await initializeComponents()
    let data_dir = process.env.IMPORT_FOLDER, importStrategy = process.env.IMPORT_STRATEGY || 'api',
        categories, result = {}, errorFolder, errorFilePath, errorItems, items, files, index
    if (!fs.existsSync(data_dir)) {
        throw new Error(`${data_dir} not exist!`)
    }
    categories = getSortedCategories()
    for (let category of categories) {
        files = fs.readdirSync(data_dir).filter((fn) => {
            return fn.match(new RegExp(category + "\-\\d+\\.json"))
        })
        files = files.sort((a, b) => {
            return fs.statSync(path.join(data_dir, a)).mtime.getTime() -
                fs.statSync(path.join(data_dir, b)).mtime.getTime();
        })
        errorFolder = path.join(data_dir, 'exception')
        errorFilePath = path.join(errorFolder, category + '.json')
        errorItems = []
        for (let file of files) {
            items = jsonfile.readFileSync(path.join(data_dir, file))
            items = sortItemsDependentFirst(items)
            items = itemsPreprocess(items, category)
            if (importStrategy === 'api') {
                for (let item of items) {
                    try {
                        await addItem(item.category, item)
                    } catch (error) {
                        item.error = String(error)
                        errorItems.push(item)
                    }
                }
                console.log(`${file} imported`)
            } else if (importStrategy === 'search') {
                try {
                    index = getSchemaIndex(category)
                    if (index) {
                        let bulkResult,errors
                        if (isSchemaSearchUpsert(category)) {
                            bulkResult = await scirichonSearch.batchCreate(index, items, true)
                        } else {
                            bulkResult = await scirichonSearch.batchCreate(index, items, false)
                        }
                        if(bulkResult.errors){
                            errors = _.filter(bulkResult.items,(item)=>{
                                return item&&item.index&&item.index.status>=400
                            })
                            errorItems.push({file,errors})
                        }
                        console.log(`${file} imported`)
                    }
                } catch (error) {
                    errorItems.push({file,error})
                }
            } else {
                throw new Error('unknown importStrategy')
            }
        }
        if (errorItems.length) {
            if (!fs.existsSync(errorFolder))
                fs.mkdirSync(errorFolder)
            jsonfile.writeFileSync(errorFilePath, errorItems, {spaces: 2})
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



