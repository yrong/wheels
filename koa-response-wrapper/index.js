'use strict';

const Log = require('log4js_wrapper')
const logger = Log.getLogger()
const querystring = require('querystring')

module.exports = function responseWrapper() {
    return async function (ctx, next) {
        try {
            const start = new Date()
            let params
            if (ctx.url.indexOf('?') >= 0) {
                params = `${ctx.url.split('?')[1]}`
                params = querystring.parse(params)
                ctx.params = Object.assign({},ctx.params,params)
            }
            await next();
            const ms = new Date() - start
            if(ctx.type === 'application/json')
                ctx.body = {status: 'ok',data:ctx.body}
            logger.info('%s %s - %s ms', ctx.method,ctx.url, ms)
        } catch (error) {
            ctx.body = JSON.stringify({
                status:"error",
                message:{
                    content: String(error),
                    displayAs:"modal"
                }
            });
            ctx.status = error.status || 500
            logger.error('%s %s - %s', ctx.method,ctx.url, String(error))
        }
    }
}