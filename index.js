const State = Object.freeze({
    IDLE: Symbol("Idle"),
    RUNNING: Symbol("Running"),
    STOPPED: Symbol("Stopped")
});

const Signal = Object.freeze({
    CONTINUE: Symbol("Continue"),
    STOP: Symbol("Stop"),
    TERMINATE: Symbol("Terminate")
});

class StackCtx
{
	constructor()
	{
		this.depth = 0;
		this.state = State.IDLE;
		this.pendingSignal = false;
		this.genPromise();
	}

	genPromise()
	{
		let _this = this;
		this.promise = new Promise(function(resolve) {
			_this.resolve = resolve;
		});
	}

	signal(sig)
	{
		// We can't accept signals in an idle state.
		console.log(this.state);
		if (this.state == State.IDLE)
		{
			return;
		}

		// Make this a queue?
		if (this.pendingSignal != false)
		{
			console.log('signal already pending');
			return;
		}

		this.pendingSignal = sig;
		this.resolve();
		this.genPromise();
	}


	async awaitNextSignal()
	{
		await this.promise;
		console.log('got signal');
	}

	async check()
	{
		if (this.pendingSignal != false)
		{
			while (this.pendingSignal == Signal.STOP)
			{
				this.pendingSignal = false;
				this.state = State.STOPPED;

				if (await this.awaitNextSignal()) {
					this.pendingSignal = false;
				}
			}


			let sig = this.pendingSignal;
			this.pendingSignal = false;

			if (sig == Signal.TERMINATE)
			{
				this.terminate()
			}

			if (sig == Signal.CONTINUE) {
				this.state = State.RUNNING;
			}
		} else {

			if (this.depth < 2000)
			{
				this.depth++;
				return;
			}

			this.depth = 0;
			return new Promise((resolve, reject) => {
				setTimeout(resolve, 0);
			});
		}
	}

	terminate(unwindStack)
	{
		this.state = State.IDLE;
		this.pendingSignal = false;

		// Throw an exception to unwind the stack
		if (unwindStack != false)
		{
			throw 'cleanup';
		}
	}

	async run(code)
	{	
		if (this.state != State.IDLE)
		{
			console.log('already running, terminating current program');
			this.signal(Signal.TERMINATE);

			console.log('test');

			// Allow the stack to clear
			await new Promise(function(resolve) {
				setTimeout(resolve, 0);
			});
		}

		this.state = State.RUNNING;
		this.pendingSignal = false;

		let checkcall = esprima.parse('async function func() { await _ctx.check(); } ').body[0].body.body[0];
	
		code = "async function _stub(_ctx) { " + code + "} ";
		let parsed = esprima.parse(code, {tolerant: true}, function (node, meta) {
			if (node.type == "FunctionDeclaration" || node.type == "FunctionExpression")
			{
				node.async = true;
				node.body.body.unshift(checkcall);
			} else if (node.type == "CallExpression")
			{
				let call = jQuery.extend(true, {}, node);

				node.type = "AwaitExpression";
				node.argument = call;

				delete node["arguments"];
				delete node["callee"];
			} else if (node.type == "WhileStatement" || node.type == "DoWhileStatement")
			{
				if (node.body.body != undefined)
				{
					node.body.body.unshift(checkcall);
				}
			}
		});
		

		code = escodegen.generate(parsed);

		code += "setTimeout(function() { _stub(_ctx) }, 0);";
		console.log(code);
		
		let _this = this;
		
		await eval(code);
	}
};

$(document).ready(function()
{
	_ctx = new StackCtx();

	$('#run').click(function() {
		_ctx.run($('#code').val());
	});

	$('#stop').click(function() {
		_ctx.signal(Signal.STOP);
	})

	$('#resume').click(function() {
		_ctx.signal(Signal.CONTINUE);
	});
});

