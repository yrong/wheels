const cache = require('../index')
const schema = require('scirichon-json-schema')
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
    })

    beforeEach(async() => {

    })

    it("add and get", async() => {
        let obj = {
            "name": "AS-2285-BAK",
            "it_service": ["{{service_email_id}}", "{{service_pop3_id}}"],
            "ip_address": ["192.168.0.108"],
            "technical_support_info": "010-123456",
            "operating_system": "{{ubuntu_os_id}}",
            "storage_info": "hp-disk1",
            "model": "b10",
            "product_date": "2016-10-11",
            "warranty_expiration_date": "2016-11-11",
            "retirement_date": "2017-02-11",
            "asset_location": {"status": "on_shelf", "shelf": "{{shelf_id}}", "label": "label", "other": "other"},
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
        assert.deepEqual(result1,result2)
    });
})