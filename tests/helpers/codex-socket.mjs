import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
export function frame(payload, opcode=1, fin=true) {
  const bytes=Buffer.isBuffer(payload)?payload:Buffer.from(JSON.stringify(payload));
  const header=Buffer.alloc(bytes.length<126?2:4);header[0]=(fin?128:0)|opcode;
  if(bytes.length<126)header[1]=bytes.length;else{header[1]=126;header.writeUInt16BE(bytes.length,2);}
  return Buffer.concat([header,bytes]);
}
export async function socketServer(path, handler, options={}) {
  const sockets=new Set(),requests=[];
  const server=createServer(socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
    let bytes=Buffer.alloc(0),upgraded=false;
    socket.on('data',chunk=>{
      bytes=Buffer.concat([bytes,chunk]);
      if(!upgraded){const end=bytes.indexOf('\r\n\r\n');if(end<0)return;
        const key=/Sec-WebSocket-Key: ([^\r]+)/i.exec(bytes.subarray(0,end).toString())[1];
        const accept=options.badHandshake?'bad':createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
        bytes=bytes.subarray(end+4);upgraded=true;
      }
      while(bytes.length>=2){let length=bytes[1]&127,offset=2;if(length===126){if(bytes.length<4)return;length=bytes.readUInt16BE(2);offset=4;}
        if(length===127){if(bytes.length<10)return;length=Number(bytes.readBigUInt64BE(2));offset=10;}
        if(!(bytes[1]&128)){socket.destroy();return;}if(bytes.length<offset+4+length)return;
        const opcode=bytes[0]&15,mask=bytes.subarray(offset,offset+4),payload=Buffer.from(bytes.subarray(offset+4,offset+4+length));
        bytes=bytes.subarray(offset+4+length);for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];if(opcode!==1)continue;
        const request=JSON.parse(payload.toString());requests.push(request);
        const send=value=>socket.write(frame(value));
        Promise.resolve(handler(request,{socket,send})).then(result=>{
          if(!Object.hasOwn(request,'id')||result===undefined||socket.destroyed)return;
          const value={id:request.id,result};
          if(options.fragment){const encoded=Buffer.from(JSON.stringify(value)),half=Math.floor(encoded.length/2);socket.write(frame(encoded.subarray(0,half),1,false));socket.write(frame(Buffer.from('ping'),9));socket.write(frame(encoded.subarray(half),0,true));}
          else send(value);
        }).catch(()=>{if(!socket.destroyed)send({id:request.id,error:{code:-1,message:'synthetic'}});});
      }
    });
  });
  server.listen(path);await once(server,'listening');
  return {requests,sockets,async close(){for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
