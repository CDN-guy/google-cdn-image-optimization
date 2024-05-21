# Changelog

### v1.0.5

* Remove Service Extensions and Switch to MediaCDN's native support of device-type, ua-family 

### v1.0.4

* Extend infrastructure deployment support for Google Media CDN 

### v1.0.3

* Add auto-rorate function

### v1.0.2 

* Add support for Google MediaCDN

* Tune up CloudRun performance and edit Terraform deployment scripts 

### v1.0.1 

* Re-organize Repo structure

* Add Terraform deployment scripts

### v1.0.0 

* Build sharp & libvips from source to support addtional image formats like JPEG 2000, JPEG XL.

* Adjust default Image Processing to support MSIE browser.

* Replace Mem-cache to LRU-cache to avoid OOM.

* Adjust Cache Key Construction for LRU-cache to base on Tranformations instead of URL path & query string

* Include Origin Image Error Handling.

