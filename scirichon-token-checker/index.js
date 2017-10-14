'use strict';

const config = require('config')
const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')
const scirichon_common = require('scirichon-common')
const internal_token_id = scirichon_common.internal_token_id
const TokenName = scirichon_common.TokenName
const apiInvoker = scirichon_common.apiInvoker

module.exports = function checkToken(options) {
    if(!options.check_token_url){
        throw new Error('missing auth_url')
    }
    return async function (ctx, next) {
        let token = options.token_name||TokenName,rp_options,result
        if(ctx.path.match(/api/i)){
            token = ctx.req.headers[token]
                || ctx.query[token]
                || (ctx.request.body && ctx.request.body[token])
                || ctx.cookies.get(token)
            if(!token){
                throw new Error('no token found in request')
            }
            if(token === internal_token_id){
                await next()
            }else{
                result = await apiInvoker('POST',options.check_token_url,'','',{token})
                _.assign(ctx,{token},result.data)
                await next()
            }
        }else{
            await next()
        }

    }
}
