// PID Controller for smooth AI steering (2.1)
export class PIDController {
    constructor(kP, kI, kD, maxIntegral = Infinity, outputLimit = Infinity) {
        this.kP = kP;
        this.kI = kI;
        this.kD = kD;
        this.maxIntegral = maxIntegral;
        this.outputLimit = outputLimit;

        this.integral = 0;
        this.previousError = 0;
    }

    reset() {
        this.integral = 0;
        this.previousError = 0;
    }

    update(error, delta) {
        // Proportional term
        const P = this.kP * error;

        // Integral term with anti-windup
        this.integral += error * delta;
        this.integral = Math.max(-this.maxIntegral, Math.min(this.maxIntegral, this.integral));
        const I = this.kI * this.integral;

        // Derivative term
        const derivative = delta > 0 ? (error - this.previousError) / delta : 0;
        const D = this.kD * derivative;

        this.previousError = error;

        // Combine and limit output
        let output = P + I + D;
        output = Math.max(-this.outputLimit, Math.min(this.outputLimit, output));

        return output;
    }
}
