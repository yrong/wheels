'use strict';

const Log = require('log4js_wrapper')
const logger = Log.getLogger()
const _ = require('lodash')

const responseWrapped = (ctx)=>{
    if(ctx.body&&ctx.body.status&&ctx.body.message&&ctx.body.message.displayAs){
        return true
    }
    return false
}

module.exports = function responseWrapper() {
    return async function (ctx, next) {
        try {
            const start = new Date()
            await next();
            const ms = new Date() - start
            if(ctx.type === 'application/json'){
                if(!responseWrapped(ctx)){
                    ctx.body = {status: 'ok',data:ctx.body,message:{displayAs:'toast'},uuid:ctx.body.uuid}
                }
            }
            logger.info('%s %s - %s ms', ctx.method,ctx.originalUrl, ms)
        } catch (error) {
            let error_object = {
                status:"error",
                message:{
                    content: "unexpected",
                    additional:String(error),
                    displayAs:"modal"
                }
            },error_message = error.message||String(error)
            if(error_message.includes('Scirichon')){
                error_object.message.content = error_message
                if(error_message.includes('ScirichonWarning')){
                    error_object.status = 'warning'
                    error_object.message.displayAs = 'console'
                }
                delete error_object.message.additional
            }
            ctx.body = error_object
            ctx.status = error.statusCode || 500
            logger.error('%s %s - %s', ctx.method,ctx.originalUrl, error.stack || error)
        }
    }
}