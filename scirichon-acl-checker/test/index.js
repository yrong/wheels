const token_checker = require('../../scirichon-token-checker')
const common = require('scirichon-common')
const acl_checker = require('../index')
const config = require('config')
const assert = require('chai').assert
const Koa = require('koa')
const Router = require('koa-router')
const router = new Router()
const app = new Koa()
const supertest = require('supertest')

const auth_url = common.getServiceApiUrl('auth')
const redisOption = {host:`${process.env['REDIS_HOST']||config.get('redis.host')}`,port:config.get('redis.port')};

(() => {
    app.use(token_checker({check_token_url:`${auth_url}/auth/check`}))
    app.use(acl_checker({redisOption}))
    router.get('/api/test', async ctx => {
        ctx.body = {}
    })
    router.post('/api/test', async ctx => {
        ctx.body = {}
    })
    app.use(router.routes())
})()


const getToken = async ()=>{
    let username = process.env['auth_user']||'demo',password = process.env['auth_passwd']||'demo',result
    result = await common.apiInvoker('POST',`${auth_url}/auth`,'/login','',{username,password})
    return result&&result.data
}

describe("scirichon-acl-check test", function() {
    it('internal token', async()=>{
        const response = await supertest(app.callback()).get(`/api/test`).set(common.TokenName,common.InternalTokenId)
        assert.isNotNull(response)
    })
    it('valid token', async()=>{
        const token = (await getToken()).token
        const response = await supertest(app.callback()).post(`/api/test`).set(common.TokenName,token)
        assert.isNotNull(response)
    });
})