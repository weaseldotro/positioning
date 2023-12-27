<script lang="ts">
	import { getAccounts, logout } from '$lib/tastytrade'
	import { Button, Select, type SelectOptionType } from 'flowbite-svelte'
	import { onMount } from 'svelte'
	import { tastytradeAccount } from '$lib/tastytrade'
	import Cookies from 'js-cookie'

	let items: SelectOptionType<any>[]
	onMount(async () => {
		let newItems: SelectOptionType<any>[] = []
		let accounts = await getAccounts()
		accounts.forEach((accountNumber) => {
			newItems.push({ name: accountNumber, value: accountNumber })
		})
		items = newItems

		if (Cookies.get('tastytrade_accountNumber')) {
			$tastytradeAccount = Cookies.get('tastytrade_accountNumber') as string
		}
	})

	const updateTastytradeAccount = () => {
		Cookies.set('tastytrade_accountNumber', $tastytradeAccount)
	}

	$: if ($tastytradeAccount != '') {
		updateTastytradeAccount()
	}
</script>

<div class="flex w-full items-center gap-2">
	<div>Account:</div>
	<div class="w-40">
		<Select size="sm" bind:value={$tastytradeAccount} {items} placeholder={items ? 'Select account' : 'Loading...'} />
	</div>
	<Button
		size="xs"
		color="dark"
		on:click={() => {
			logout()
		}}>Logout</Button
	>
</div>
