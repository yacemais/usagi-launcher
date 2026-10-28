import { loadProduct } from '../src/main/config/product';
loadProduct(process.cwd()).then(()=>console.log('Usagi public build configuration validated.')).catch(error=>{console.error(error instanceof Error?error.message:'Invalid Usagi configuration.');process.exitCode=1;});
