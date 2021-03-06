const config = require('config')
const neo4j = require('neo4j-driver')
const neo4jConfig = config.get('neo4j')
const neo4jDriver = neo4j.driver("neo4j://"+(process.env['NEO4J_HOST']||neo4jConfig.host)+":"+neo4jConfig.port, neo4j.auth.basic(process.env['NEO4J_USER']||neo4jConfig.user, process.env['NEO4J_PASSWD']||neo4jConfig.password))
const {parse} = require('parse-neo4j')
const _ = require('lodash')
const scirichonSchema = require('scirichon-json-schema')

const executeCypher = (cql,params)=>{
    return new Promise((resolve, reject) => {
        const session = neo4jDriver.session()
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

const initNeo4j = async ()=>{
    const schemas = scirichonSchema.getSchemas()
    for(let category of _.keys(schemas)){
        let uniqueKeys = schemas[category].uniqueKeys
        if(uniqueKeys){
            for(let field of uniqueKeys){
                await executeCypher(`CREATE CONSTRAINT IF NOT EXISTS ON (n:${category}) ASSERT n.${field} IS UNIQUE`)
            }
        }
        await executeCypher(`CREATE CONSTRAINT IF NOT EXISTS ON (n:${category}) ASSERT n.unique_name IS UNIQUE`)
        await executeCypher(`CREATE INDEX IF NOT EXISTS For (n:${category}) ON (n.uuid)`)
    }
    console.log("init schema in neo4j success!")
}


const initialize = async ()=>{
    const option = {redisOption:config.get('redis'),prefix:process.env['SCHEMA_TYPE']}
    await scirichonSchema.loadSchemas(option)
    try{
        await initNeo4j()
    }catch(err){
        console.log(err)
    }
}

module.exports = {initialize}

