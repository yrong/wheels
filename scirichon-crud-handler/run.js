#!/usr/bin/env node

/**
 * init logger
 */
const log4js_wrapper = require('log4js-wrapper-advanced')
const config = require('config')
log4js_wrapper.initialize(config.get('logger'))
const logger = log4js_wrapper.getLogger()

const responseWrapper = require('scirichon-response-wrapper')
const KoaNeo4jApp = require('koa-neo4j-monitor')
const scirichonSchema = require('scirichon-json-schema')
const scirichonCache = require('scirichon-cache')

/**
 * int koa app and load middleware
 */
const path = require('path')
const middleware = require(path.resolve('./middleware'))
const neo4jConfig = config.get('neo4j')
let koaNeo4jOptions = {
    neo4j: {
        boltUrl: `bolt://${process.env['NEO4J_HOST']||neo4jConfig.host}:${neo4jConfig.port}`,
        user: process.env['NEO4J_USER']||neo4jConfig.user,
        password: process.env['NEO4J_PASSWD']||neo4jConfig.password
    },
    loadRouteByApp:true
}
if(config.get('wrapResponse'))
    koaNeo4jOptions.responseWrapper = responseWrapper
const app = new KoaNeo4jApp(koaNeo4jOptions)
middleware.load(app)

/**
 * load route from schema and start server
 */
const redisOption = config.get('redis')
const additionalPropertyCheck = config.get('additionalPropertyCheck')
const schema_option = {redisOption,additionalPropertyCheck,prefix:process.env['SCHEMA_TYPE']}
const NODE_NAME = process.env['NODE_NAME']
const routes = require(path.resolve('./routes'));
(async () => {
    try {
        await app.neo4jConnection.initialized
        await scirichonSchema.initialize(schema_option)
        await scirichonCache.initialize(schema_option)
        app.use(app.router.routes());
        routes.load(app)
        app.server.listen(config.get(`${NODE_NAME}.port`), async function () {
            if(parseInt(process.env['INIT_CACHE'])){
                await scirichonCache.loadAll()
            }
            logger.info("Server started, listening on port: " + config.get(`${NODE_NAME}.port`))
        })
        process.on('uncaughtException', (err) => {
            logger.error(`Caught exception: ${err}`)
        })
    } catch (e) {
        console.error('Got an error during server start: %s', e.stack);
    }
})();
