use proxy_wasm::traits::*;
use proxy_wasm::types::*;

use user_agent_parser::UserAgentParser;
use std::rc::Rc;
use log::info;
use std::time::Instant;



proxy_wasm::main! {{
    proxy_wasm::set_log_level(LogLevel::Trace);
    proxy_wasm::set_root_context(|_| -> Box<dyn RootContext> {
        Box::new(ImgOptPluginRoot { ua_parser: Rc::new(None) })
    });

}}


struct ImgOptPlugin {
    ua_parser: Rc<Option<UserAgentParser>>,
}

impl HttpContext for ImgOptPlugin {

    fn on_http_request_headers(&mut self, _: usize, _: bool) -> Action {

        // WASM execution time calculation
        // start_time
        let now = Instant::now();

        // extract User-Agent header from incoming http request header
        let user_agent = &self.get_http_request_header("User-Agent").unwrap();
        // [debug use] User-Agent
        // let user_agent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";
        
        // parse user-agent & os info
        let ua = self.ua_parser.as_ref().as_ref().unwrap().parse_product(user_agent);
        let os = self.ua_parser.as_ref().as_ref().unwrap().parse_os(user_agent);
        // comment [device],[cpu],[engine] parsing as they have high cpu usage
        // let device = self.ua_parser.parse_device(user_agent);
        // let cpu = ua_parser.parse_cpu(user_agent);
        // let engine = ua_parser.parse_engine(user_agent);
        let ua_name = ua.name.unwrap_or_default();
        let os_name = os.name.unwrap_or_default();
        //let device_name = device.name.unwrap_or_default();
        
        // adds request headers
        //self.add_http_request_header("x-ua", &ua_name);
        self.add_http_request_header("x-client-os", &os_name);
        //self.add_http_request_header("x-device", &device_name);

        // device type defaults to "desktop", and will be override to other types later based on OS, UA info
        // set device type accordingly based on parsed OS and UA info
        let mut device_type = match os_name.to_lowercase() {
            lowercase if lowercase.contains("chromecast") => "tablet",
            lowercase if lowercase.contains("tv") => "smart_tv",
            lowercase if lowercase.contains("roku") => "smart_tv",
            lowercase if lowercase.contains("ios") => "mobile",
            lowercase if lowercase.contains("android") => "mobile",
            lowercase if lowercase.contains("watchos") => "wearable",
            _ => "desktop"
        };
        // additional mobile device characteristics
        if ua_name.to_lowercase().contains("phone") | ua_name.to_lowercase().contains("mobile") {device_type = "mobile";}
        // (optional) Client-Hint to determine mobile devices
        if self.get_http_request_header("Sec-CH-UA-Mobile").unwrap_or_default().contains("?1") {device_type = "mobile";}


        // adds request headers
        // ImageOPtimizer will leverage [x-client-device-type], [x-client-ua-family], [x-client-host] to process iamges
        self.add_http_request_header("x-client-device-type", &device_type);
        self.add_http_request_header("x-client-ua-family", &ua_name);
        self.add_http_request_header("x-client-host", &self.get_http_request_header(":authority").unwrap());

        // WASM logs
        info!("incoming [accept]: {}, added [x-client-device-type]: {}, [x-client-ua-family]: {}", &self.get_http_request_header("accept").unwrap_or_default(), device_type, ua_name);

        // Accept header parsing
        // if client has a preferred image type, we store in [x-client-accept] to hint ImageOptimizer
        match self.get_http_request_header("accept") {
            Some(accept) if accept.contains("image/webp") => self.add_http_request_header("x-client-accept","webp"),
            Some(accept) if accept.contains("image/avif") => self.add_http_request_header("x-client-accept","avif"),
            Some(accept) if accept.contains("image/jxl") => self.add_http_request_header("x-client-accept","jxl"),
            Some(accept) if accept.contains("image/heic") => self.add_http_request_header("x-client-accept","heic"),
            Some(accept) if accept.contains("image/png") => self.add_http_request_header("x-client-accept","png"),
            // Some(accept) if accept.contains("image/apng") => self.add_http_request_header("x-client-accept","apng"),
            // Some(accept) if accept.contains("image/svg+xml") => self.add_http_request_header("x-client-accept","svg+xml"),
            //_ => self.add_http_request_header("x-client-accept","none"),
            _ => (),
            }
        
        // end_time
        let new_now = Instant::now();
        info!("wasm total time {:?}", new_now.duration_since(now));
        // [END] WASM execution time calculation

        Action::Continue
    }

    // fn on_http_response_headers(&mut self, _: usize, _: bool) -> Action {

    //     //adds response header
    //     self.add_http_response_header("x-proxy", "envoy");
    //     Action::Continue
    // }
}

impl Context for ImgOptPlugin {}

struct ImgOptPluginRoot {
    ua_parser: Rc<Option<UserAgentParser>>,
}

impl RootContext for ImgOptPluginRoot {
    fn on_configure(&mut self, _: usize) -> bool {
        info!("Configuring WASM...");

        // configuration_data with base64 encoded regexes.yaml from uap-core
        // https://github.com/ua-parser/uap-core/blob/master/regexes.yaml 
        // these regexes are used for user-agent parser
        // it is simplified with only device & os regexes
        if let Some(config_bytes) = self.get_plugin_configuration() {
            let regexes = String::from_utf8(config_bytes).unwrap();
            self.ua_parser = Rc::new(Some(UserAgentParser::from_str(&regexes).unwrap()));
        }

        info!("[Success]Loaded regex from Configuration");
        return true
    }

    fn create_http_context(&self, _: u32) -> Option<Box<dyn HttpContext>> {
        Some(Box::new(ImgOptPlugin {
            ua_parser: self.ua_parser.clone(),
        }))
    }

    fn get_type(&self) -> Option<ContextType> {
        Some(ContextType::HttpContext)
    }
}

impl Context for ImgOptPluginRoot {}

