const cache = require('../index')
const schema = require('scirichon-json-schema')
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
    })

    beforeEach(async() => {

    })

    it("add and get", async() => {
        let obj = {
            "name": "AS-2285-BAK",
            "it_service": [uuid.v1()],
            "ip_address": ["192.168.0.108"],
            "technical_support_info": "010-123456",
            "operating_system": uuid.v1(),
            "storage_info": "hp-disk1",
            "model": "b10",
            "product_date": "2016-10-11",
            "warranty_expiration_date": "2016-11-11",
            "retirement_date": "2017-02-11",
            "asset_location": {"status": "on_shelf", "shelf": uuid.v1(), "label": "label", "other": "other"},
            "management_ip": ["192.168.0.108"],
            "monitored": true,
            "asset_id": "test"
        }
        obj.uuid = uuid.v1()
        obj.unique_name = obj.name
        obj.category='PhysicalServer'
        await cache.addItem(obj)
        let result1 = await cache.getItemByCategoryAndUniqueName(obj.category,obj.name)
        let result2 = await cache.getItemByCategoryAndID(obj.category,obj.uuid)
        assert.isUndefined(result1.technical_support_info)
        assert.deepEqual(result1,result2)

        let obj2 = {...obj}
        obj2.uuid = uuid.v1()
        await cache.batchAddItems([obj,obj2])
        obj2 = await cache.get(obj2.uuid)
        assert.isNotNull(obj2)

        await cache.batchDelItems([obj.uuid,obj2.uuid])
        obj2 = await cache.get(obj2.uuid)
        assert.isNull(obj2)
    });
})
