import readline from 'node:readline';
const scenario = process.argv[2] || 'ok';
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
readline.createInterface({ input: process.stdin }).on('line', line => {
  const req = JSON.parse(line);
  if (!req.method) return;
  const reply = result => send({ jsonrpc:'2.0', id:req.id, result });
  if (req.method === 'initialize') {
    if (req.params.protocolVersion !== 1 || req.params.clientCapabilities.terminal) process.exit(4);
    reply({ protocolVersion: 1 });
  } else if (req.method === 'session/new') {
    send({ jsonrpc:'2.0', method:'session/update', params:{ sessionId:'one', update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'startup junk'}} } });
    reply({ sessionId:'one', _meta:{piAcp:{startupInfo:'delayed startup'}} });
  } else if (req.method === 'session/set_model') {
    if (req.params.modelId !== 'chosen') process.exit(5);
    reply({});
  } else if (req.method === 'session/prompt') {
    send({jsonrpc:'2.0',method:'session/update',params:{sessionId:'one',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'delayed startup'}}}});
    if (scenario === 'hang') return;
    if (scenario === 'bad') return process.stdout.write('broken!\n');
    if (scenario === 'permission') send({jsonrpc:'2.0',id:'tool',method:'session/request_permission',params:{}});
    for (const [sessionId, sessionUpdate, text] of [['other','agent_message_chunk','unrelated'],['one','agent_thought_chunk','hidden'],['one','agent_message_chunk','{"ok":true,"text":"中文"}']]) {
      const frame = Buffer.from(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId,update:{sessionUpdate,content:{type:'text',text}}}})+'\n');
      // Split a UTF-8 character across writes.
      const split = frame.indexOf(Buffer.from('中')) + 1;
      if (split > 0) { process.stdout.write(frame.subarray(0,split)); process.stdout.write(frame.subarray(split)); } else process.stdout.write(frame);
    }
    reply({stopReason:scenario === 'truncated' ? 'max_tokens' : 'end_turn'});
  }
});
