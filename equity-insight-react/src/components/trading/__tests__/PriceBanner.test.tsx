import { act, render, screen, waitFor } from "@testing-library/react"
import PriceBanner from "../PriceBanner"
import { vi } from "vitest"

class MockWebSocket {
  public onopen: (() => void) | null = null
  public onmessage: ((event: { data: string }) => void) | null = null
  public onclose: (() => void) | null = null
  public readyState = WebSocket.OPEN

  open() {
    this.onopen?.()
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  send() {
    /* noop */
  }

  close() {
    this.readyState = WebSocket.CLOSED
    this.onclose?.()
  }
}

describe("PriceBanner", () => {
  it("renders fetched prices", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      "BTC-USDT-SWAP": { price: 12345.67, change_pct_24h: 1.23 },
    })
    render(<PriceBanner fetchPrices={mockFetch} wsFactory={() => new MockWebSocket() as unknown as WebSocket} />)

    expect(await screen.findByText("$12,345.67")).toBeInTheDocument()
    expect(screen.getByText("BTC")).toBeInTheDocument()
  })

  it("updates when websocket sends market snapshot", async () => {
    const socket = new MockWebSocket()
    const fetcher = vi.fn().mockResolvedValue({})
    render(<PriceBanner fetchPrices={fetcher} wsFactory={() => socket as unknown as WebSocket} />)

    await act(async () => {
      socket.open()
    })

    await act(async () => {
      socket.emitMessage({
        type: "market_update",
        data: {
          "BTC-USDT-SWAP": {
            price: 200,
            change_pct_24h: 5,
          },
        },
        timestamp: "2024-01-01T00:00:00Z",
      })
    })

    await waitFor(() => expect(screen.getByText("$200.00")).toBeInTheDocument())
    expect(screen.getByText("+5.00%")).toBeInTheDocument()
  })
})
