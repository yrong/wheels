const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const common = require('scirichon-common')
const schema = require('scirichon-json-schema')
const ScirichonWarning = common.ScirichonWarning
const logger = require('log4js-wrapper-advanced').getLogger()
const responseHandler = require('scirichon-response-mapper')
const cypherBuilder = require('../cypher/cypherBuilder')
const requestHandler = require('./requestHandler')
const cypherInvoker = require('../cypher/cypherInvoker')
const requestPostHandler = require('./requestPostHandler')
const cache = require('scirichon-cache')
const search = require('scirichon-search')

module.exports = {
    cypherInvoker,
    requestHandler,
    requestPostHandler,
    setHandlers : function(handlers){
        global._scirichonHandlers = handlers
    },
    getHandlers : function(){
        return global._scirichonHandlers||{}
    },
    cudItem_preProcess: async function (params, ctx) {
        params = await requestHandler.handleRequest(params,ctx)
        let customizedHandler = global._scirichonHandlers&&global._scirichonHandlers[params.category]
        if(customizedHandler){
            if(params.procedure&&params.procedure.ignoreCustomizedHandler){
            }else{
                params = await customizedHandler.preProcess(params,ctx)
            }
        }
        if (ctx.method === 'POST'||ctx.method === 'PUT' || ctx.method === 'PATCH') {
            params.stringified_fields = requestHandler.objectFields2String(_.assign({},params.fields))
        }
        requestHandler.logCypher(params)
        return params
    },
    cudItem_postProcess:async function (result,params,ctx) {
        let customizedHandler = global._scirichonHandlers&&global._scirichonHandlers[params.category]
        if(customizedHandler){
            if(params.procedure&&params.procedure.ignoreCustomizedHandler) {
            }else{
                params = await customizedHandler.postProcess(params, ctx)
            }
        }
        if((ctx.method==='POST'||ctx.method==='PUT'||ctx.method==='PATCH'||ctx.method==='DELETE')&&ctx.fromBatch!==true){
            if(ctx.method==='DELETE'&&(!result||(result.length!=1))){
                throw new ScirichonWarning('no record found')
            }
            try{
                requestPostHandler.updateCache(params,ctx)
                requestPostHandler.updateSearch(params,ctx)
                requestPostHandler.addNotification(params,ctx)
            }catch(e){
                logger.error(e.stack || e)
                throw new ScirichonWarning(String(e))
            }
        }
        return {uuid:params.uuid}||{}
    },
    queryItems_preProcess:async function (params,ctx) {
        params = await requestHandler.handleRequest(params,ctx)
        return params
    },
    queryItems_postProcess:async function (result,params,ctx) {
        if(params.uuid){
            result = result[0]
            if(result){
                result = await responseHandler.responseMapper(result,params,ctx)
            }else{
                logger.warn(`不存在uuid:${params.uuid}的对象`)
            }
        }else{
            if(params.pagination){
                result = result[0]
                if(result.results)
                    result.results = await responseHandler.responseMapper(result.results,params,ctx)
            }else{
                result = await responseHandler.responseMapper(result,params,ctx)
            }
        }
        return result
    },
    customizedQueryItems_preProcess:(params,ctx)=>{
        if(params.cypherQueryFile){
            params.cypher = fs.readFileSync(path.resolve('./cypher/'+params.cypherQueryFile + '.cyp'), "utf8")
        }
        requestHandler.logCypher(params)
        return params
    },
    getCategoryInheritanceHierarchy:async function (params,ctx) {
        let schemaInheritanceRelationship = schema.getSchemaHierarchy(params.category),result
        let addSubTypeRelationship = async(relationship)=>{
            result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryInheritHierarchyCypher,{category:relationship.name})
            if(result&&result.length){
                relationship.children = _.map(result,(subtype)=>{
                    return {name:subtype.category}
                })
            }
            if(relationship.children){
                for(let child of relationship.children){
                    await addSubTypeRelationship(child)
                }
            }
        }
        await addSubTypeRelationship(schemaInheritanceRelationship)
        return schemaInheritanceRelationship
    },
    addCategoryInheritanceHierarchy: async function (params,ctx) {
        let result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateInheritRelCypher,params)
        return result
    },
    getCategorySchema:async function(params, ctx) {
        let result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryInheritHierarchyCypher,params)
        return {
            properties:schema.getSchemaProperties(params.category),
            parents:schema.getParentCategories(params.category),
            references:_.uniq(_.map(schema.getSchemaRefProperties(params.category),(attr)=>attr.schema)),
            subtypes:_.map(result,(subtype)=>subtype.category)
        }
    },
    getItemWithMembers: async function(params,ctx){
        let addItemMembers = async(item)=>{
            let result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryItemWithMembersCypher(item.category),{uuid:item.uuid})
            if(result&&result.length) {
                result = result[0]
                if(result.self){
                    item = await responseHandler.responseMapper(result.self,params,ctx)
                }
                if (result.members&&result.members.length) {
                    let members = []
                    for (let member of result.members) {
                        member = await addItemMembers(member)
                        members.push(member)
                    }
                    item = _.merge(item, {members})
                }
            }
            return item
        }
        let result=[]
        if(params.uuid){
            result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryNodeCypher(params),{uuid:params.uuid})
            if(result&&result.length){
                result = result[0]
                result = await addItemMembers(result)
            }
        }else{
            results = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryNodesCypher(params))
            if(results&&results.length){
                if(params.root){
                    results = _.filter(results,(result)=>{
                        return result.root===true
                    })
                }
                for(let item of results){
                    item = await addItemMembers(item)
                    result.push(item)
                }
            }
        }
        return result
    },
    clean:async function(params, ctx) {
        await cypherInvoker.executeCypher(ctx,cypherBuilder.generateDelAllCypher(params),params)
        await cache.flushAll()
        let route_schemas = schema.getApiRouteSchemas()
        for(let route_schema of route_schemas) {
            if (route_schema.search && route_schema.search.index) {
                if(route_schema.service===process.env['NODE_NAME']){
                    await search.deleteAll(route_schema.search.index)
                }
            }
        }
    },
    getLicense:async function(params,ctx){
        return ctx.state&&ctx.state.license||{}
    }
}

