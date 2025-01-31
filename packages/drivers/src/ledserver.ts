import * as ds from "@devicescript/core"
import {
    PixelBuffer,
    fillFade,
    pixelBuffer,
    correctGamma,
} from "@devicescript/runtime"
import { Server, ServerOptions, startServer } from "@devicescript/server"

export interface LedServerOptions {
    /**
     * Number of LEDs
     */
    length: number
    /**
     * Brightness applied to pixels before being rendered.
     * This allocate twice the memory if less than 1 as an additional buffer is needed to compute the color.
     * @default 1
     */
    intensity?: number
    /**
     * Number of columns of a LED matrix
     */
    columns?: number
    ledsPerPixel?: number
    /**
     * For monochrome LEDs, the LED wavelength
     */
    waveLength?: number
    /**
     * The luminous power of the LEDs, is it very bright?
     */
    luminousIntensity?: number
    /**
     * The shape and topology of the LEDs
     */
    variant?: ds.LedVariant
    /**
     * Specify the amount of gamma correction
     */
    gamma?: number
}

class LedServer extends Server implements ds.LedServerSpec {
    private _intensity: number
    private _columns: number
    private _ledPerPixels: number
    private _waveLength: number
    private _luminousIntensity: number
    private _variant: ds.LedVariant
    private _gamma: number

    readonly buffer: PixelBuffer

    constructor(options: LedServerOptions & ServerOptions) {
        super(ds.Led.spec, options)
        this.buffer = pixelBuffer(options.length)
        this._intensity = options.intensity ?? 1
        this._columns = options.columns
        this._ledPerPixels = options.ledsPerPixel
        this._waveLength = options.waveLength
        this._luminousIntensity = options.luminousIntensity
        this._variant = options.variant
        this._gamma = options.gamma
    }

    pixels(): ds.Buffer {
        if (this.buffer.length < 64) return this.buffer.buffer
        else return Buffer.alloc(0)
    }
    set_pixels(value: ds.Buffer): void {
        this.buffer.buffer.blitAt(0, value, 0, value.length)
    }
    intensity(): number {
        return this._intensity
    }
    set_intensity(value: number): void {
        this._intensity = Math.constrain(value, 0, 1)
    }
    actualBrightness(): number {
        return this._intensity
    }
    numPixels(): number {
        return this.buffer.length
    }
    numColumns(): number {
        return this._columns
    }
    ledsPerPixel(): number {
        return this._ledPerPixels
    }
    waveLength(): number {
        return this._waveLength || 0
    }
    luminousIntensity(): number {
        return this._luminousIntensity
    }
    variant(): ds.LedVariant {
        return this._variant
    }

    /**
     * Display buffer on hardware
     */
    async show(): Promise<void> {
        let b = this.buffer
        // full brightness so we can use the buffer as is
        if (this._intensity < 1 || this._gamma) {
            const r = b.allocClone()
            if (this._intensity < 1) fillFade(r, this._intensity)
            if (this._gamma) correctGamma(r, this._gamma)
            b = r
        }
        // TODO: render b to hardware
    }
}

/**
 * Starts a programmable LED server.
 * Simulation is supported for up to 64 LEDs; otherwise only the simulator
 * will reflect the state of LEDs.
 * @param options
 * @returns
 */
export async function startLed(
    options: LedServerOptions & ServerOptions
): Promise<ds.Led> {
    const { length } = options
    const server = new LedServer(options)
    const client = new ds.Led(startServer(server))

    ;(client as any)._buffer = server.buffer
    client.show = async function () {
        await server.show()
        if (length <= 64) await client.pixels.write(server.buffer.buffer)
        else if (ds.isSimulator()) {
            // the simulator handles brightness separately
            const topic = `jd/${server.serviceIndex}/leds`
            await ds._twinMessage(topic, server.buffer.buffer)
        }
    }

    return client
}
