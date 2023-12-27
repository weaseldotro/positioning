<script lang="ts">
	import { Button, Label, Modal, Input, Toast } from 'flowbite-svelte'
	import { login } from '$lib/tastytrade'
	import { tastytradeSession } from '$lib/tastytrade'

	let username: string = ''
	let password: string = ''
	let showError = false
	let working = false

	const authorize = async (e?: SubmitEvent) => {
		if (e) {
			e.preventDefault()
		}

		working = true
		showError = false
		if (!(await login(username, password))) {
			showError = true
			working = false
		}
	}
</script>

<Modal open={$tastytradeSession == 'invalid'} size="xs" autoclose={false} dismissable={false} class="w-full">
	<form class="flex flex-col space-y-6" on:submit={authorize}>
		<h3 class="text-xl font-medium text-gray-900 dark:text-white p-0">Please login with your tastytrade account</h3>
		<Label class="space-y-2">
			<span>Username / Email</span>
			<Input type="text" name="username" bind:value={username} placeholder="username" required disabled={working} />
		</Label>
		<Label class="space-y-2">
			<span>Password</span>
			<Input type="password" name="password" placeholder="••••••••••" bind:value={password} required disabled={working} />
		</Label>
		<Button color="blue" type="submit" class="w-full1" disabled={working}>Login</Button>
		{#if showError}
			<Toast color="red" class="mb-2">
				<svelte:fragment slot="icon">
					<svg aria-hidden="true" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
					<span class="sr-only">Error</span>
				</svelte:fragment>
				Incorrect username or password
			</Toast>
		{/if}
	</form>
</Modal>
