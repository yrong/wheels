const assert = require('chai').assert
const Koa = require('koa')
const bodyParser = require('koa-bodyparser')
const Router = require('koa-router')
const router = new Router()
const app = new Koa()
const supertest = require('supertest')

const common = require('scirichon-common')
const responseWrapper = require('../index')


describe("scirichon-response-wrapper test", function() {

    let request,server

    before(() => {
        app.use(bodyParser());
        app.use(responseWrapper())
        router.get('/api/test', async ctx => {
            ctx.body = {a:1}
        })
        router.post('/api/test', async ctx => {
            ctx.throw(new common.ScirichonError('error'))
        })
        router.put('/api/test', async ctx => {
            ctx.throw(new common.ScirichonWarning('warning'))
        })
        router.del('/api/test', async ctx => {
            throw new Error('unexpect')
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

    it('normal', async ()=>{
        const response = await request.get(`/api/test`)
        assert.equal(response.statusCode,200)
        assert.equal(response.body.data.a,1)
    })

    it('exception', async ()=>{
        const response = await request.post(`/api/test`)
        assert.equal(response.statusCode,501)
        assert.equal(response.body.message.content,'error')
        assert.equal(response.body.message.displayAs,'modal')
    })

    it('warning', async ()=>{
        let response = await request.put(`/api/test`)
        assert.equal(response.statusCode,502)
        assert.equal(response.body.message.content,'warning')
        assert.equal(response.body.message.displayAs,'console')
    })

    it('unexpect exception', async ()=>{
        const response = await request.del(`/api/test`)
        assert.equal(response.statusCode,500)
        assert.equal(response.body.message.content,'unexpected')
    })
})
