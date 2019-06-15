const search = require('../index')
const schema = require('scirichon-json-schema')
const cache = require('scirichon-cache')
const config = require('config')
const assert = require('chai').assert
const uuid = require('uuid')


describe("scirichon-cache", () => {

    const prefix = "test-cache";
    const redisOption = config.get('redis')
    const option = {redisOption,prefix}

    before(async () => {
        await schema.initSchemas(option)
        await cache.initialize(option)
    })

    after(async () => {
        await schema.clearSchemas()
        await cache.flushAll()
        await search.deleteAll('cmdb')
    })

    beforeEach(async() => {

    })

    it("add and get", async() => {
        let it_service = {name:"email"}
        it_service.uuid = uuid.v1()
        it_service.unique_name = it_service.name
        it_service.category='ITService'
        await cache.addItem(it_service)
        await search.addOrUpdateItem(it_service)
        let physicalServer = {
            "name": "AS-2285-BAK",
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
            "asset_id": "test"
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
            "per_page":1
        }
        const result = await search.searchItem(query)
        assert.equal(result.count,1)
    });
})
