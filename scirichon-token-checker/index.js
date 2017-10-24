'use strict';

const config = require('config')
const _ = require('lodash')
const rp = require('request-promise')
const queryString = require('querystring')
const internal_token_id = 'internal_api_invoke'
const TokenName = 'token'
const apiInvoker = function(method,url,path,params,body){
    var options = {
        method: method,
        uri: url + path + (params?('?' + queryString.stringify(params)):''),
        body:body,
        json: true,
        headers: {
        }
    }
    options.headers[TokenName] = internal_token_id
    return rp(options)
}

module.exports = function checkToken(options) {
    if(!options.check_token_url){
        throw new Error('missing auth_url')
    }
    return async function (ctx, next) {
        let token = options.token_name||TokenName,rp_options,result
        if (ctx.path.includes('/auth/login') || ctx.path.includes('/auth/register')
            || ctx.path.includes('.html')||ctx.path.includes('.ico')||!ctx.path.match(/api/i))
        {
            await next()
        }
        else {
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
                _.assign(ctx,{token},result.data||result)
                await next()
            }
        }
    }
}
