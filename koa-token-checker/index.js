'use strict';

const rp = require('request-promise')
const config = require('config')
const _ = require('lodash')

module.exports = function checkToken() {
    return async function (ctx, next) {
        const Token = config.get('auth.token_name')
        let token = ctx.req.headers[Token]
            || ctx.query[Token]
            || (ctx.request.body && ctx.request.body[Token])
            || ctx.cookies.get(Token)
        let token_check_url = config.get('auth.base_url')+config.get('auth.token_check_path')
        let options = {uri:token_check_url,method:'POST',json:true,body:{token:token}}
        let result = await rp(options)
        _.assign(ctx,result.data)
        await next()
    }
}
