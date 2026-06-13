use image::{DynamicImage, RgbaImage, imageops, codecs::jpeg::JpegEncoder, ColorType};
use std::time::Instant;
use std::io::Cursor;

fn main() {
    let start = Instant::now();
    let raw = RgbaImage::new(3456, 2234); // MacBook Pro 16" Retina size
    let mut image = DynamicImage::ImageRgba8(raw);
    println!("Allocation: {:?}", start.elapsed());
    
    let resize_start = Instant::now();
    let ratio = 1920.0 / image.width() as f64;
    let new_h = (image.height() as f64 * ratio) as u32;
    image = image.resize_exact(1920, new_h, imageops::FilterType::Lanczos3);
    println!("Lanczos3 Resize: {:?}", resize_start.elapsed());
    
    let convert_start = Instant::now();
    let image = DynamicImage::ImageRgb8(image.into_rgb8());
    println!("Convert RGB8: {:?}", convert_start.elapsed());
    
    let encode_start = Instant::now();
    let mut jpeg_bytes: Vec<u8> = Vec::new();
    let mut cursor = Cursor::new(&mut jpeg_bytes);
    let mut encoder = JpegEncoder::new_with_quality(&mut cursor, 85);
    encoder.encode(image.as_bytes(), image.width(), image.height(), image.color().into()).unwrap();
    println!("JPEG Encode: {:?}", encode_start.elapsed());
}
