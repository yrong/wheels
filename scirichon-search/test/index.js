const search = require('../index')
const schema = require('scirichon-json-schema')
const cache = require('scirichon-cache')
const config = require('config')
const assert = require('chai').assert
const uuid = require('uuid')


describe("scirichon-cache", () => {

    const prefix = process.env['SCHEMA_TYPE']||"scirichon-test";
    const redisOption = config.get('redis')
    const option = {redisOption,prefix}

    before(async () => {
        await schema.initSchemas(option)
        await cache.initialize(option)
    })

    after(async () => {
        await schema.clearSchemas()
        await cache.flushAll()
        await search.deleteAll('cmdb,it_service')
    })

    beforeEach(async() => {

    })

    it("add and get", async() => {
        let it_service_name = 'email'
        let it_service = {name:it_service_name}
        it_service.uuid = uuid.v1()
        it_service.unique_name = it_service_name
        it_service.category='ITService'
        await cache.addItem(it_service)
        await search.addOrUpdateItem(it_service)
        let physicalServer_name = 'AS-2285'
        let physicalServer = {
            "name": physicalServer_name,
            "it_service": [it_service.uuid],
            "ip_address": ["192.168.0.108"],
            "technical_support_info": "010-123456",
            "storage_info": "hp-disk1",
            "model": "b10",
            "product_date": "2016-10-11",
            "warranty_expiration_date": "2016-11-11",
            "retirement_date": "2017-02-11",
            "management_ip": ["192.168.0.108"],
            "monitored": true,
            "asset_id": "test",
            "test_expiration_date": 1511936480773
        }
        physicalServer.uuid = uuid.v1()
        physicalServer.unique_name = physicalServer.name
        physicalServer.category='PhysicalServer'
        await cache.addItem(physicalServer)
        await search.addOrUpdateItem(physicalServer)
        const query = {
            "category":"ConfigurationItem",
            "body":
                {
                    "query": {
                        "bool":{
                            "must":[
                                {"match":{"model":"b10"}},
                                {"bool":{"should":[{"match":{"it_service":it_service.uuid}}]}}
                            ]
                        }

                    },
                    "sort" : [
                        { "product_date" : {"order" : "desc"}}]
                },
            "page":1,
            "per_page":1,
            "_source": ['uuid']
        }
        let result = await search.searchItem(query)
        assert.equal(result.results[0].uuid,physicalServer.uuid)

        const join_query = {
            "category":"ConfigurationItem",
            "refBody":
                {
                    "query": {
                        "bool":{
                            "must":[
                                {"match":{"name":it_service_name}}
                            ]
                        }
                    }
                },
            "refAttr":'it_service',
            "_source": ['uuid']
        }
        result = await search.joinSearchItem(join_query)
        assert.equal(result.results[0].uuid,physicalServer.uuid)
    });
})
