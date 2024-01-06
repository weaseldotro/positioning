<script lang="ts">
    export let key: string
    export let value: any
    export let color = ''
</script>

<div class="flex hover:bg-yellow-100 leading-4 py-1">
    <div class="min-w-28 w-full">{key}</div>
    <div class="font-semibold {color}">{value}</div>
</div>
