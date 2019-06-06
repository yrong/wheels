const _ = require('lodash')
const common = require('scirichon-common')
const logger = require('log4js-wrapper-advanced').getLogger()
const schema = require('scirichon-json-schema')
const search = require('scirichon-search')
const scirichon_cache = require('scirichon-cache')
const requestHandler = require('./requestHandler')
const cypherInvoker = require('../cypher/cypherInvoker')
const requestPostHandler = require('./requestPostHandler')
const hooks = require('./index')

const batchUpdate  = async(ctx,category,uuids,change_obj,removed)=>{
    let cypher = `unwind {uuids} as uuid match (n:${category}) where n.uuid=uuid set `,script=``,old_obj, new_obj,objs=[],
        stringified_change_obj = _.omit(requestHandler.objectFields2String(_.assign({category},change_obj)),'category')
    for(let key in stringified_change_obj){
        cypher += `n.${key}={${key}},`
    }
    for(let key in change_obj){
        script += `ctx._source.${key}=params.${key};`
    }
    cypher = cypher.substr(0,cypher.length-1)
    if(removed){
        cypher += ` remove `
        for(let key of removed){
            cypher += `n.${key},`
            script += `ctx._source.remove("${key}");`
        }
        cypher = cypher.substr(0,cypher.length-1)
    }
    await cypherInvoker.executeCypher(ctx, cypher, _.assign({uuids},stringified_change_obj))
    let index = requestHandler.getIndexByCategory(category)
    if(index) {
        await search.batchUpdate(index, uuids, {script: {inline: script, params: change_obj}})
    }
    let schema_obj = schema.getAncestorSchema(category)
    if(schema_obj.cache&&schema_obj.cache.ignore){
    }else{
        for (let uuid of uuids) {
            old_obj = await scirichon_cache.getItemByCategoryAndID(category, uuid)
            if (!_.isEmpty(old_obj)) {
                new_obj = _.assign({}, old_obj, change_obj)
                if (removed) {
                    new_obj = _.omit(new_obj, removed)
                }
                await scirichon_cache.addItem(new_obj)
                objs.push({uuid,old_obj,new_obj})
            }
        }
        let needNotify = requestPostHandler.needNotify({category},ctx)
        if(needNotify) {
            let notifications = [], notification_url = common.getServiceApiUrl('notifier')
            for (let obj of objs) {
                notification = {user: ctx[common.TokenUserName], source: process.env['NODE_NAME'], action: 'UPDATE'}
                notification.type = category
                notification.update = change_obj
                notification.new = obj.new_obj
                notification.old = obj.old_obj
                notifications.push(notification)
            }
            await common.apiInvoker('POST', notification_url, '/api/notifications/batch', '', notifications)
        }
    }
}

const batchAdd  = async(ctx,category,entries)=>{
    let stringified_items = _.map(entries,(entry)=>entry.stringified_fields)
    let cypher = `unwind {items} as item merge (n:${category} {uuid:item.uuid}) on create set n=item on match set n=item`
    let result = await cypherInvoker.executeCypher(ctx, cypher, {items: stringified_items})
    ctx.fromBatch = true
    for(let item of entries){
        await hooks.cudItem_postProcess(result,item,ctx)
    }
    let index = requestHandler.getIndexByCategory(category)
    if(index){
        let items = _.map(entries,(entry)=>entry.fields)
        await search.batchCreate(index,items)
    }
    for(let entry of entries){
        await scirichon_cache.addItem(entry.fields)
    }
    let needNotify = requestPostHandler.needNotify({category},ctx)
    if(needNotify){
        let notifications = [],notification_url = common.getServiceApiUrl('notifier')
        for(let entry of entries){
            notification = {user:ctx[common.TokenUserName],source:process.env['NODE_NAME'],action:'CREATE'}
            notification.type = entry.category
            notification.new = entry.fields
            notifications.push(notification)
        }
        await common.apiInvoker('POST',notification_url,'/api/notifications/batch','',notifications)
    }
}

const batchDelete  = async(ctx,category,uuids)=>{
    let cypher = `unwind {uuids} as uuid match (n:${category} {uuid:uuid}) detach delete n`
    await cypherInvoker.executeCypher(ctx, cypher, {uuids: uuids})
    let index = requestHandler.getIndexByCategory(category)
    if(index){
        await search.batchDelete(index,uuids)
    }
    let schema_obj = schema.getAncestorSchema(category)
    if(schema_obj.cache&&schema_obj.cache.ignore){
    }else{
        let needNotify = requestPostHandler.needNotify({category},ctx),old_obj,
            notifications = [],notification_url = common.getServiceApiUrl('notifier')
        for(let uuid of uuids) {
            old_obj = await scirichon_cache.getItemByCategoryAndID(category, uuid)
            if (!_.isEmpty(old_obj)) {
                await scirichon_cache.delItem(old_obj)
                if(needNotify) {
                    notification = {user:ctx[common.TokenUserName],source:process.env['NODE_NAME'],action:'DELETE'}
                    notification.type = category
                    notification.old = old_obj
                    notifications.push(notification)
                }
            }
        }
        if(needNotify&&notifications.length) {
            await common.apiInvoker('POST', notification_url, '/api/notifications/batch', '', notifications)
        }
    }
}

const batchAddProcessor = async (params,ctx)=>{
    let entries = params.data.fields,category = params.data.category,item,items=[],result,handlers
    for(let entry of entries){
        schema.checkObject(category,entry)
        item={category,data:{category}}
        item.data.fields = entry
        item.procedure = params.procedure
        item = await hooks.cudItem_preProcess(item,ctx)
        items.push(item)
    }
    await batchAdd(ctx,category,items)
    return _.map(items,(item)=>{return {uuid:item.uuid}})
}

const batchUpdateProcessor = async (params,ctx)=>{
    let fields = params.data.fields,category = params.data.category,uuids = params.data.uuids
    await batchUpdate(ctx,category,uuids,fields)
    return uuids
}

const batchDeleteProcessor = async (params,ctx)=>{
    let category = params.data.category,uuids = params.data.uuids
    await batchDelete(ctx,category,uuids)
    return uuids
}

const loopAddProcessor = async (params,ctx)=>{
    let entries = params.data.fields,item,result,results=[]
    for(let entry of entries){
        try{
            schema.checkObject(params.data.category,entry)
            item={category:params.data.category,uuid:entry.uuid,data:{category:params.data.category,fields:entry}}
            item = await hooks.cudItem_preProcess(item,ctx)
            result = []
            for(let cypher of item.cypher){
                result.push(await cypherInvoker.executeCypher(ctx,cypher,item))
            }
            result = await hooks.cudItem_postProcess(result,item,ctx)
            results.push(result)
        }catch(error){
            result = entry
            result.category = params.data.category
            result.error = error.message
            results.push(result)
        }
    }
    return results
}

const loopUpdateProcessor = async (params,ctx)=>{
    let fields = params.data.fields,category = params.data.category,uuids = params.data.uuids,results=[]
    for(let uuid of uuids){
        try{
            item={category,uuid,data:{category,fields}}
            item = await hooks.cudItem_preProcess(item,ctx)
            result = []
            for(let cypher of item.cypher){
                result.push(await cypherInvoker.executeCypher(ctx,cypher,item))
            }
            result = await hooks.cudItem_postProcess(result,item,ctx)
            results.push(result)
        }catch(error){
            result={category,uuid,error:error.message}
            results.push(result)
        }
    }
    return results
}

const loopDeleteProcessor = async (params,ctx)=>{
    let category = params.data.category,uuids = params.data.uuids,results=[]
    for(let uuid of uuids){
        try{
            item={category,uuid}
            item = await hooks.cudItem_preProcess(item,ctx)
            result = await cypherInvoker.executeCypher(ctx,item.cypher,item)
            result = await hooks.cudItem_postProcess(result,item,ctx)
            results.push(result)
        }catch(error){
            result={category,uuid,error:error.message}
            results.push(result)
        }
    }
    return results
}

module.exports = {batchAdd,batchUpdate,batchAddProcessor,batchUpdateProcessor,batchDeleteProcessor,loopAddProcessor,loopUpdateProcessor,loopDeleteProcessor}
