// Add this at the very top of src/index.ts
import { TextDecoder, TextEncoder } from 'text-encoding';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

//Exports all handler functions
export * from "./mappings/mappingHandlers";