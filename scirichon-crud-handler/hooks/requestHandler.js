const _ = require('lodash')
const jp = require('jsonpath')
const config = require('config')
const uuid = require('uuid')
const schema = require('scirichon-json-schema')
const common = require('scirichon-common')
const ScirichonError = common.ScirichonError
const logger = require('log4js_wrapper').getLogger()
const cypherBuilder = require('../cypher/cypherBuilder')
const scirichon_cache = require('scirichon-cache')
const cypherInvoker = require('../cypher/cypherInvoker')
const internalUsedFields = common.internalUsedFields

const getCategoryByUrl = function (ctx) {
    let category,val,routeSchemas = schema.getApiRouteSchemas()
    for (val of routeSchemas){
        if(ctx.url.includes(val.route)){
            category = val.id
            break
        }
    }
    return category;
}

const getIndexByCategory = (category)=>{
    let schema_obj = schema.getAncestorSchema(category),index
    if(schema_obj&&schema_obj.search&&schema_obj.search.index){
        index = schema_obj.search.index
    }
    return index
}

const assignFields4Query = async function (params,ctx) {
    params.category = params.category||getCategoryByUrl(ctx)
    if(params.page){
        params.pagination = true
        params.limit = params.per_page = params.per_page || config.get('perPageSize')
        params.skip = (parseInt(params.page)-1) * parseInt(params.per_page)
    }
}

const stringifyFields = async (params) => {
    objectFields2String(params)
    _.assign(params, params.fields)
    stringFields2Object(params)
}

const objectFields2String = (params)=>{
    let objectFields=schema.getSchemaObjectProperties(params.category)
    for (let key of objectFields) {
        if (_.isObject(params.fields[key])) {
            params.fields[key] = JSON.stringify(params.fields[key])
        }
    }
    return params
}

const stringFields2Object = (params) => {
    let objectFields=schema.getSchemaObjectProperties(params.category)
    for(let key of objectFields){
        if(_.isString(params[key])){
            try{
                params[key] = JSON.parse(params[key])
            }catch(error){
                //same field with different type in different categories(e.g:'status in 'ConfigurationItem' and 'ProcessFlow'),ignore error and just for protection here
            }
        }
    }
    return params
}

const checkReferenceId = async (key,value)=>{
    let uuid,cached_val= await scirichon_cache.getItemByCategoryAndID(key,value)
    if(cached_val&&cached_val.uuid){
        uuid = cached_val.uuid
    }else{
        throw new ScirichonError(`can not find category ${key} as ${value} in scirichon cache`)
    }
    return uuid
}


const checkReference = async (params)=>{
    let refs = schema.getSchemaRefProperties(params.category),key,path,vals,category
    if(refs){
        for(let ref of refs){
            key = ref.attr
            path = `$.${key}`
            category = ref.schema||(ref.items&&ref.items.schema)
            vals = jp.query(params, path)[0]
            if(!_.isEmpty(vals)){
                if(_.isArray(vals)){
                    for(let val of vals){
                        await checkReferenceId(category,val)
                    }
                } else{
                    await checkReferenceId(category,vals)
                }
            }
        }
    }
    return params
}

const logCypher = (params)=>{
    logger.debug(`cypher to executed:${JSON.stringify({cypher:params.cyphers||params.cypher,params:_.omit(params,['cypher','cyphers','data','fields_old','method','url','token'])},null,'\t')}`)
}

const checkIfUidReferencedByOthers = (uuid,items)=>{
    for(let item of items){
        let objectFields=schema.getSchemaObjectProperties(item.category)
        for(let key of objectFields){
            if(_.isString(item[key])){
                try{
                    item[key] = JSON.parse(item[key])
                }catch(error){
                    //same field with different type in different categories(e.g:'status in 'ConfigurationItem' and 'ProcessFlow'),ignore error and just for protection here
                }
            }
        }
        let refProperties = schema.getSchemaRefProperties(item.category)
        for(let refProperty of refProperties){
            let key = refProperty.attr
            let val = jp.query(item, `$.${key}`)[0]
            if(uuid==val||(_.isArray(val)&&_.includes(val,uuid))){
                throw new ScirichonError(`node already used by ${JSON.stringify(item)}`)
            }
        }
    }
}

const fieldsChecker = (params)=>{
    let fields = params.data&&params.data.fields||params
    for (let prop in fields) {
        if(_.includes(internalUsedFields,prop)){
            throw new ScirichonError(`${prop} not allowed`)
        }
    }
    return params
}

const generateUniqueNameFieldAndCompoundModel = async (params, ctx) => {
    let schema_obj = schema.getAncestorSchema(params.category),compound_obj=_.assign({category:params.category},params.fields)
    if (schema_obj.uniqueKeys && schema_obj.uniqueKeys.length) {
        params.fields.unique_name = params.fields[schema_obj.uniqueKeys[0]]
    } else if (schema_obj.compoundKeys && schema_obj.compoundKeys.length) {
        if(params.fields['name']){
            compound_obj['name'] = params.fields['name']
        }
        for (let key of schema_obj.compoundKeys) {
            if (key !== 'name') {
                let category = _.capitalize(key)
                let result = await scirichon_cache.getItemByCategoryAndID(category, params.fields[key])
                if (!_.isEmpty(result)) {
                    key = key + "_name"
                    compound_obj[key] = result.name
                }
            }
        }
        let keyNames = _.map(schema_obj.compoundKeys, (key) => key !== 'name' ? key + "_name" : key)
        params.fields.unique_name = compound_obj.unique_name = common.buildCompoundKey(keyNames, compound_obj)
    }
    return compound_obj
}

const generateDynamicSeqField = async (params,ctx)=>{
    let schema_obj = schema.getAncestorSchema(params.category)
    if(schema_obj&&schema_obj.dynamicSeqField){
        let result =  await cypherInvoker.executeCypher(ctx,cypherBuilder.generateSequence(params.category), params)
        if(result&&result.length){
            params.fields[schema_obj.dynamicSeqField] = String(result[0])
        }
    }
}

const assignFields4CreateOrUpdate = async (params,ctx)=>{
    if (ctx.method === 'POST') {
        params.fields = legacyFormat(params)?_.assign({}, params.data.fields):_.assign({}, params)
        params.category = params.fields.category = legacyFormat(params)?params.data.category:params.category
        params.fields.uuid = params.fields.uuid || uuid.v1()
        params.fields.created = params.fields.created || Date.now()
        params.fields.lastUpdated = params.fields.lastUpdated || Date.now()
        await generateDynamicSeqField(params, ctx)
        await generateUniqueNameFieldAndCompoundModel(params, ctx)
        if(params.fields.unique_name && !(params.jsonImport)){
            let obj = await scirichon_cache.getItemByCategoryAndUniqueName(params.category,params.fields.unique_name)
            if(!_.isEmpty(obj)){
                throw new ScirichonError(`${params.category}存在名为"${params.fields.unique_name}"的同名对象`)
            }
        }
    } else if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        params.category = legacyFormat(params)?params.data.category:params.category
        let result = await cypherInvoker.executeCypher(ctx, cypherBuilder.generateQueryNodeCypher(params), params)
        if (result && result[0]) {
            params.change = legacyFormat(params)?_.assign({}, params.data.fields):_.assign({}, params)
            params.fields_old = _.omit(result[0], 'id')
            params.fields = _.assign({}, params.fields_old, params.change)
            params.fields.lastUpdated = params.change.lastUpdated || Date.now()
        } else {
            throw new ScirichonError("no record found")
        }
        await generateUniqueNameFieldAndCompoundModel(params, ctx)
    }
    params = _.assign(params, params.fields)
    await checkReference(params)
    await stringifyFields(params)
}

const assignFields4Delete = async (params,ctx)=>{
    if(params.uuid){
        params.category = params.category||getCategoryByUrl(ctx);
        let result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryNodeWithRelationCypher(params), params)
        if(result&&result[0]){
            result = result[0]
            if(result.self){
                params.fields_old = _.omit(result.self,'id')
                if(result.items&&result.items.length){
                    checkIfUidReferencedByOthers(params.uuid,result.items)
                }
            }
        }else{
            throw new ScirichonError("no record found")
        }
    }else if(ctx.url.includes('/api/items')&&ctx.method==='DELETE'){
        ctx.deleteAll = true
    }else{
        throw new ScirichonError("missing uuid")
    }
}

const legacyFormat  = (params,ctx)=>{
    return params.data&&params.data.fields&&params.data.category
}

const assignFields = async (params,ctx)=>{
    if (ctx.method === 'POST'||ctx.method === 'PUT' || ctx.method === 'PATCH') {
        await assignFields4CreateOrUpdate(params,ctx)
    }
    else if (ctx.method === 'DELETE') {
        await assignFields4Delete(params,ctx)
    }else if(ctx.method === 'GET'){
        await assignFields4Query(params,ctx)
    }
}

const generateCypher = async(params,ctx)=>{
    if(ctx.method === 'POST'||ctx.method === 'PUT' || ctx.method === 'PATCH'){
        params.cypher = cypherBuilder.generateAddOrUpdateCyphers(params);
    }else if(ctx.method === 'DELETE'){
        params.cypher = cypherBuilder.generateDelNodeCypher(params)
        if(ctx.deleteAll){
            params.cypher = cypherBuilder.generateDelAllCypher()
        }
    }else if(ctx.method === 'GET'){
        if(params.uuid){
            params.cypher = cypherBuilder.generateQueryNodeCypher(params)
        }
        else{
            params.cypher = cypherBuilder.generateQueryNodesCypher(params)
            if(params.tags||params.subcategory){
                params.tags = (params.tags||params.subcategory).split(",")
                params.cypher = cypherBuilder.generateQueryItemByCategoryCypher(params)
            }
        }
    }
    logCypher(params)
}

const handleRequest = async (params, ctx)=>{
    params = common.pruneEmpty(params)
    await assignFields(params,ctx)
    await generateCypher(params,ctx)
    return params
}


module.exports = {getCategoryByUrl,handleRequest,fieldsChecker,logCypher,getIndexByCategory,generateUniqueNameFieldAndCompoundModel,stringFields2Object,legacyFormat}