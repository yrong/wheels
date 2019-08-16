const config = require('config')
const neo4j = require('neo4j-driver').v1
const neo4jConfig = config.get('neo4j')
const neo4jDriver = neo4j.driver("bolt://"+(process.env['NEO4J_HOST']||neo4jConfig.host)+":"+neo4jConfig.port, neo4j.auth.basic(process.env['NEO4J_USER']||neo4jConfig.user, process.env['NEO4J_PASSWD']||neo4jConfig.password))
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

const initNeo4jConstraints = async ()=>{
    const schemas = scirichonSchema.getSchemas()
    for(let category of _.keys(schemas)){
        let uniqueKeys = schemas[category].uniqueKeys
        if(uniqueKeys){
            for(let field of uniqueKeys){
                await executeCypher(`CREATE CONSTRAINT ON (n:${category}) ASSERT n.${field} IS UNIQUE`)
            }
        }
        await executeCypher(`CREATE CONSTRAINT ON (n:${category}) ASSERT n.unique_name IS UNIQUE`)
    }
    console.log("add constraint in neo4j success!")
}


const initialize = async ()=>{
    const option = {redisOption:config.get('redis'),prefix:process.env['SCHEMA_TYPE']}
    await scirichonSchema.loadSchemas(option)
    await initNeo4jConstraints()
}

module.exports = {initialize}

