const _ = require('lodash')
const config = require('config')
const elasticsearch = require('elasticsearch')
const esConfig = config.get('elasticsearch')
const client = new elasticsearch.Client({
    host: (process.env['ES_HOST']||esConfig.host) + ":" + esConfig.port,
    httpAuth:esConfig.user +":" + esConfig.password,
    requestTimeout: esConfig.requestTimeout,
    apiVersion: '5.6'
})
const esMapper = require('./mapper')
const docType = 'doc'

const addOrUpdateItem = async function(params,isUpdate,isIdAutoGenerated) {
    let index_obj,index = esMapper.getIndexByCategory(params.category)
    if(index){
        index_obj = {
            index: index,
            type: docType,
            refresh:true
        }
        index_obj.id = params.uuid
        if(isIdAutoGenerated){
            index_obj = _.omit(index_obj,['id'])
        }
        if(!isUpdate){
            index_obj.body = params
            return await client.index(index_obj)
        }else{
            index_obj.body = {doc: params}
            return await client.update(index_obj)
        }
    }
}

const deleteItem = async function (params) {
    let index = esMapper.getIndexByCategory(params.category)
    if (index) {
        return await client.delete({
            index: index,
            type: docType,
            id:params.uuid,
            refresh: true
        })
    }
}

const searchItem = async (params, ctx)=> {
    let query = params.uuid?`uuid:${params.uuid}`:(params.keyword?params.keyword:'*');
    let _source = params.source?params.source:true;
    let params_pagination = {"from":0,"size":config.get('perPageSize')},from;
    if(params.page&&params.per_page){
        from = (String)((parseInt(params.page)-1) * parseInt(params.per_page));
        params_pagination = {"from":from,"size":params.per_page}
    }
    let queryObj = params.body?{body:params.body}:{q:query}
    let category = params.category
    let index = esMapper.getIndexByCategory(category)
    if(!index){
        throw new Error(`${category} not searchable`)
    }
    if(queryObj.body&&queryObj.body.aggs){
        params_pagination = {size:0}
        params.aggs = true
    }
    let searchObj = _.assign({
        index: index,
        _source:_source
    },queryObj,params_pagination)
    let result = await client.search(searchObj)
    result = await esMapper.esResponseMapper(result,params,ctx)
    return result
}

const joinSearchItem = async (params, ctx)=> {
    let refAttr = params.refAttr,category = params.category,refCategory = esMapper.findRefCategory(category,refAttr)
    if(!refCategory){
        throw new Error(`attribute ${refAttr} in ${category} is not joinable`)
    }
    let refIndex = esMapper.getIndexByCategory(refCategory)
    if(!refIndex){
        throw new Error(`${refCategory} not searchable`)
    }
    if(!params.body){
        throw new Error(`body field not found`)
    }
    let inner_result = await client.search({
        index: refIndex,
        body: params.body,
        _source:'uuid'
    })
    let inner_uuids = _.map(_.map(inner_result.hits.hits,(result)=>result._source),(obj)=>obj.uuid)
    let index = esMapper.getIndexByCategory(category)
    if(!index){
        throw new Error(`${category} not searchable`)
    }
    let _source = params._source?params._source:true;
    let params_pagination = {"from":0,"size":config.get('perPageSize')},from;
    if(params.page&&params.per_page){
        from = (String)((parseInt(params.page)-1) * parseInt(params.per_page));
        params_pagination = {"from":from,"size":params.per_page}
    }
    let terms_id_query = {};terms_id_query[refAttr] = inner_uuids
    let queryObj = {"query":{"terms":terms_id_query}}
    let searchObj = _.assign({
        index: index,
        _source:_source,
        body: queryObj
    },params_pagination)
    let result = await client.search(searchObj)
    result = await esMapper.esResponseMapper(result,params,ctx)
    return result
}

const checkStatus = ()=> {
    return client.ping({
        requestTimeout: Infinity
    })
}

const batchUpdate = async (index,uuids,body)=>{
    let bulks = []
    for (let uuid of uuids) {
        bulks.push({update: {_index: index, _type: docType, _id: uuid}})
        bulks.push(body)
    }
    return await client.bulk({body: bulks, refresh: true})
}

const batchCreate = async (index,items,isIdAutoGenerated)=>{
    let bulks = [],bulk_action,bulk_obj
    for (let item of items) {
        bulk_obj = item
        bulk_action = {_index: index, _type: docType, _id: item.uuid}
        if(isIdAutoGenerated){
            bulk_action = _.omit(bulk_action,['_id'])
        }
        bulks.push({index:bulk_action})
        bulks.push(bulk_obj)
    }
    return await client.bulk({body:bulks,refresh:true})
}

const batchDelete = async (index,uuids)=>{
    let bulks = []
    for (let uuid of uuids) {
        bulks.push({delete: {_index: index, _type: docType, _id: uuid}})
    }
    return await client.bulk({body: bulks, refresh: true})
}

const deleteAll = async function (index) {
    let delObj = {
        index: index,
        body: {
            query: {match_all: {}}
        },
        refresh: true
    }
    await client.deleteByQuery(delObj)
}

module.exports = {searchItem,deleteItem,addOrUpdateItem,checkStatus,batchUpdate,batchCreate,client,deleteAll,batchDelete,joinSearchItem}
