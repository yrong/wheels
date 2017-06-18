'use strict';

const rp = require('request-promise')
const config = require('config')
const _ = require('lodash')

module.exports = function checkToken(options) {
    if(!options.check_token_url){
        throw new Error('missing auth_url')
    }
    return async function (ctx, next) {
        let token = options.token_name||'token'
        token = ctx.req.headers[token]
            || ctx.query[token]
            || (ctx.request.body && ctx.request.body[token])
            || ctx.cookies.get(token)
        if(!token){
            throw new Error('no token found in request')
        }
        let rp_options = {uri:options.check_token_url,method:'POST',json:true,body:{token:token}}
        let result = await rp(rp_options)
        _.assign(ctx,result.data)
        await next()
    }
}
