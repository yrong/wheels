const logger = require('log4js_wrapper').getLogger()
const config = require('config')
const neo4j = require('neo4j-driver').v1
const {parse} = require('parse-neo4j-fork')
const neo4jConfig = config.get('neo4j')
const neo4jDriver = neo4j.driver("bolt://"+(process.env['NEO4J_HOST']||neo4jConfig.host)+":"+neo4jConfig.port, neo4j.auth.basic(neo4jConfig.user, neo4jConfig.password))


const executeCypher = async (ctx,cypher,params)=>{
    logger.debug(`cypher to executed:${JSON.stringify({cypher,params},null,'\t')}`)
    let result = await ctx.app.executeCypher.bind(ctx.app.neo4jConnection)(cypher,params,true)
    return result
}

const queryCql = async (cql,params)=>{
    return new Promise((resolve, reject) => {
        const session = neo4jDriver.session()
        logger.info(`cypher to executed:${JSON.stringify({cql,params},null,'\t')}`)
        session.run(cql, params)
            .then(result => {
                session.close()
                resolve(parse(result))
            })
            .catch(error => {
                session.close()
                error = error.fields ? JSON.stringify(error.fields[0]) : String(error)
                reject(`error while executing Cypher: ${error}`)
            });
    })
}

module.exports = {executeCypher,queryCql}