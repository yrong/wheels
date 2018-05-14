const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const common = require('scirichon-common')
const schema = require('scirichon-json-schema')
const ScirichonWarning = common.ScirichonWarning
const logger = require('log4js_wrapper').getLogger()
const responseHandler = require('scirichon-response-mapper')
const cypherBuilder = require('../cypher/cypherBuilder')
const requestHandler = require('./requestHandler')
const cypherInvoker = require('../cypher/cypherInvoker')
const requestPostHandler = require('./requestPostHandler')

let customizedHandlers={}

module.exports = {
    cypherInvoker,
    requestHandler,
    requestPostHandler,
    setHandlers : function(handlers){
        customizedHandlers = handlers
    },
    cudItem_preProcess: async function (params, ctx) {
        params = await requestHandler.handleRequest(params,ctx)
        let customizedHandler = customizedHandlers[params.category]
        if(customizedHandler&&!params.jsonImport)
            params = await customizedHandler.preProcess(params,ctx)
        return params
    },
    cudItem_postProcess:async function (result,params,ctx) {
        let customizedHandler = customizedHandlers[params.category]
        if(customizedHandler&&!params.jsonImport){
            params = await customizedHandler.postProcess(params, ctx)
        }
        if(ctx.method==='POST'||ctx.method==='PUT'||ctx.method==='PATCH'){
            await Promise.all([requestPostHandler.updateCache(params,ctx),requestPostHandler.updateSearch(params,ctx),requestPostHandler.addNotification(params,ctx)]).catch((e)=>{
                logger.error(e.stack || e)
                throw new ScirichonWarning(String(e))
            })
        }
        if(ctx.method==='DELETE'){
            if(!ctx.deleteAll&&(!result||(result.length!=1))){
                throw new ScirichonWarning('no record found')
            }
            await Promise.all([requestPostHandler.updateCache(params,ctx),requestPostHandler.updateSearch(params,ctx),requestPostHandler.addNotification(params,ctx)]).catch((e)=>{
                logger.error(e.stack || e)
                throw new ScirichonWarning(String(e))
            })
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
                logger.warn(`${params.uuid} not found`)
            }
        }else{
            if(params.pagination){
                result = result[0]
                if(result.results)
                    result.results = await responseHandler.responseMapper(result.results,params,ctx);
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
                if (result.members&&result.members.length) {
                    let members = []
                    for (let member of result.members) {
                        member = await addItemMembers(member)
                        members.push(member)
                    }
                    item = _.merge(result.self, {members})
                }
            }
            return item
        }
        let result
        if(params.uuid){
            result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryNodeCypher(params),{uuid:params.uuid})
            if(result&&result.length){
                result = result[0]
                result = await addItemMembers(result)
            }
        }else{
            result = await cypherInvoker.executeCypher(ctx,cypherBuilder.generateQueryNodesCypher(params))
            let results = []
            if(result&&result.length){
                for(let item of result){
                    item = await addItemMembers(item)
                    results.push(item)
                }
                if(params.root){
                    results = _.filter(results,(result)=>{
                        return result.root===true
                    })
                }
                result = results
            }
        }
        return result
    }
}

