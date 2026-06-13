use image::{DynamicImage, RgbaImage, codecs::jpeg::JpegEncoder, ColorType};
use std::io::Cursor;

fn main() {
    let raw = RgbaImage::new(100, 100);
    let image = DynamicImage::ImageRgba8(raw);
    
    let mut jpeg_bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut jpeg_bytes);
    let mut encoder = JpegEncoder::new_with_quality(&mut cursor, 85);
    
    match encoder.encode(image.as_bytes(), image.width(), image.height(), image.color().into()) {
        Ok(_) => println!("Success!"),
        Err(e) => println!("Error: {}", e),
    }
}
