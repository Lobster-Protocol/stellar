// The SubQuery sandbox does not expose TextEncoder/TextDecoder as globals
import { TextDecoder, TextEncoder } from 'text-encoding';
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

//Exports all handler functions
export * from "./mappings/mappingHandlers";