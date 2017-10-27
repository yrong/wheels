'use strict';

const config = require('config')
const _ = require('lodash')
const rp = require('request-promise')
const common = require('scirichon-common')
const ScirichonError = common.ScirichonError

module.exports = function checkToken(options) {
    if(!options.check_token_url){
        throw new Error('missing auth_url')
    }
    return async function (ctx, next) {
        let token,result,passport
        if (ctx.path.includes('/auth/login') || ctx.path.includes('/auth/register')
            || ctx.path.includes('.html')||ctx.path.includes('.ico')||!ctx.path.match(/api/i) || ctx.headers[common.TokenName]==common.InternalTokenId)
        {
            await next()
        }
        else {
            token = ctx.req.headers[common.TokenName]
                || ctx.query[common.TokenName]
                || (ctx.request.body && ctx.request.body[common.TokenName])
                || ctx.cookies.get(common.TokenName)
            if(!token){
                throw new ScirichonError('no token found in request')
            }
            result = await common.apiInvoker('POST',options.check_token_url,'','',{token})
            passport = result.data||result
            if(passport&&passport.local){
                ctx.cookies.set(common.TokenUserName, JSON.stringify(_.pick(passport.local,['uuid','alias','userid','avatar','roles'])))
                ctx.cookies.set(common.TokenName, token)
            }else{
                throw new ScirichonError('no user for the token found')
            }
            await next()
        }
    }
}
