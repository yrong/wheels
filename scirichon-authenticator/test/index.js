const assert = require('chai').assert
const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const Router = require('koa-router')
const router = new Router()
const app = new Koa()
const supertest = require('supertest')
const config = require('config')

const common = require('scirichon-common')
const auth_url = common.getServiceApiUrl('auth')
const redisOption = config.get('redis')
const token_checker = require('../index').checkToken
const acl_checker = require('../index').checkAcl


const getToken = async (username,password)=>{
    let result = await common.apiInvoker('POST',`${auth_url}/auth`,'/login','',{username,password})
    return result&&result.data
}

const tests = [
    {name:'admin',passwd:'admin',role:'admin',statusCode:200},
    {name:'guest',passwd:'guest',statusCode:401},
    {name:'readonly',passwd:'readonly',role:'viewer',statusCode:401}
]

describe("scirichon-authenticator test", function(done) {

    let request,server,tokenName = common.getConfigWithDefaultValue('auth.tokenFieldName','token'),
        internalToken = common.getConfigWithDefaultValue('auth.internalUsedToken','qwe!@#')

    before(() => {
        app.use(bodyParser());
        app.use(token_checker({check_token_url:`${auth_url}/auth/check`}))
        app.use(acl_checker({redisOption}))
        router.get('/api/test', async ctx => {
            ctx.body = {a:1}
        })
        router.post('/api/test', async ctx => {
            ctx.body = {a:1}
        })
        app.use(router.routes())
        server = app.listen()
    })

    after(() => {
        server.close()
    })

    beforeEach(async() => {
        request = supertest(server)
    })

    it('invalid token', async ()=>{
        const response = await request.get(`/api/test`).set(tokenName,'invalid token')
        assert.equal(response.statusCode,401)
    })

    it('internal token', async ()=>{
        const response = await request.get(`/api/test`).set(tokenName,internalToken)
        assert.equal(response.body.a,1)
    })
    it('valid token', async()=>{
        for(let test of tests){
            const token = (await getToken(test.name,test.passwd)).token
            const response = await request.post(`/api/test`).set(tokenName,token)
            assert.equal(response.statusCode,test.statusCode)
        }
    });
})
