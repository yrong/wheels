'use strict';

const Log = require('log4js_wrapper')
const logger = Log.getLogger()

module.exports = function responseWrapper() {
    return async function (ctx, next) {
        try {
            const start = new Date()
            await next();
            const ms = new Date() - start
            if(ctx.type === 'application/json')
                ctx.body = {status: 'ok',data:ctx.body}
            logger.info('%s %s - %s ms', ctx.method,ctx.originalUrl, ms)
        } catch (error) {
            let error_object = {
                status:"error",
                message:{
                    content: "unexpected",
                    additional:String(error),
                    displayAs:"modal"
                }
            }
            if(error&&error.type){
                error_object.message.content = `${error.type}`
            }
            ctx.body = JSON.stringify(error_object);
            ctx.status = error.status || 500
            logger.error('%s %s - %s', ctx.method,ctx.originalUrl, error.stack || error)
        }
    }
}