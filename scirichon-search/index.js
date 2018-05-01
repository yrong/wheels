const _ = require('lodash')
const config = require('config')
const elasticsearch = require('elasticsearch')
const esConfig = config.get('elasticsearch')
const es_client = new elasticsearch.Client({
    host: (process.env['ES_HOST']||esConfig.host) + ":" + esConfig.port,
    requestTimeout: esConfig.requestTimeout
})
const scirionCommon = require('scirichon-common')
const hidden_fields = scirionCommon.internalUsedFields
const esMapper = require('./mapper')
const scirichonCache = require('scirichon-cache')


const addOrUpdateItem = async function(params,isUpdate,isIdAutoGenerated) {
    let index_obj,index = esMapper.getIndexByCategory(params.category)
    if(index){
        index_obj = {
            index: index,
            type: 'doc',
            refresh:true
        }
        index_obj.id = params.uuid
        if(isIdAutoGenerated){
            index_obj = _.omit(index_obj,['id'])
        }
        if(!isUpdate){
            index_obj.body = _.omit(params,hidden_fields)
            await es_client.index(index_obj)
        }else{
            index_obj.body = {doc: _.omit(params, hidden_fields)}
            await es_client.update(index_obj)
        }
    }
}

const deleteItem = async function (params) {
    let index = esMapper.getIndexByCategory(params.category)
    if (index) {
        let delObj = {
            index: index,
            body: {
                query: {term: {uuid: params.uuid}}
            },
            refresh: true
        }
        await es_client.deleteByQuery(delObj)
    }
}

const deleteAll = async function() {
    let delObj = {
        index: '*',
        body: {
            query: {match_all:{}}
        },
        refresh:true
    }
    await es_client.deleteByQuery(delObj)
}

const searchItem = async (params, ctx)=> {
    let query = params.uuid?`uuid:${params.uuid}`:(params.keyword?params.keyword:'*');
    let _source = params._source?params._source.split(','):true;
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
    let result = await es_client.search(searchObj)
    console.log(`search in es:${JSON.stringify({body:searchObj,result},null,'\t')}`)
    result = await esMapper.esResponseMapper(result,params,ctx)
    return result
}

const checkStatus = ()=> {
    return es_client.ping({
        requestTimeout: Infinity
    })
}

const batchUpdate = async (index,uuids,body)=>{
    let bulks = [],result
    for (let uuid of uuids) {
        bulks.push({update: {_index: index, _type: 'doc', _id: uuid}})
        bulks.push(body)
    }
    await es_client.bulk({body: bulks, refresh: true})
}

const batchCreate = async (index,items,isIdAutoGenerated)=>{
    let bulks = [],bulk_action,bulk_obj,result
    for (let item of items) {
        bulk_obj = _.omit(item,hidden_fields)
        bulk_action = {_index: index, _type: 'doc', _id: item.uuid}
        if(isIdAutoGenerated){
            bulk_action = _.omit(bulk_action,['_id'])
        }
        bulks.push({index:bulk_action})
        bulks.push(bulk_obj)
    }
    await es_client.bulk({body:bulks,refresh:true})
}

const initialize = scirichonCache.initialize

module.exports = {searchItem,deleteItem,addOrUpdateItem,checkStatus,batchUpdate,batchCreate,deleteAll,initialize}