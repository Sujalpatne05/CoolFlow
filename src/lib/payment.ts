// Payment utility functions

export interface PaymentConfig {
  razorpayEnabled: boolean;
  razorpayKeyId: string;
  razorpayKeySecret: string;
  upiEnabled: boolean;
  upiId: string;
  upiName: string;
}

// Initialize Razorpay payment
export const initiateRazorpayPayment = async (
  amount: number,
  orderNumber: string,
  customerName: string,
  customerPhone: string,
  customerEmail: string,
  onSuccess: (paymentId: string) => void,
  onFailure: (error: any) => void
) => {
  try {
    // Load Razorpay script
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => {
      const options = {
        key: '', // Will be set from backend
        amount: amount * 100, // Amount in paise
        currency: 'INR',
        name: 'OrderNest',
        description: `Order #${orderNumber}`,
        order_id: '', // Will be created from backend
        handler: function (response: any) {
          onSuccess(response.razorpay_payment_id);
        },
        prefill: {
          name: customerName,
          email: customerEmail,
          contact: customerPhone,
        },
        theme: {
          color: '#F97316', // Orange theme
        },
        modal: {
          ondismiss: function () {
            onFailure({ message: 'Payment cancelled by user' });
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    };

    script.onerror = () => {
      onFailure({ message: 'Failed to load payment gateway' });
    };
  } catch (error) {
    onFailure(error);
  }
};

// Generate UPI Payment Intent
export const generateUPILink = (
  upiId: string,
  amount: number,
  name: string,
  orderNumber: string
): string => {
  // UPI payment link format
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    name
  )}&am=${amount}&cu=INR&tn=Order%20${encodeURIComponent(orderNumber)}`;
  
  return upiLink;
};

// Generate UPI QR Code data
export const generateUPIQRData = (
  upiId: string,
  amount: number,
  name: string,
  orderNumber: string
): string => {
  return generateUPILink(upiId, amount, name, orderNumber);
};

// Validate UPI ID format
export const validateUPIId = (upiId: string): boolean => {
  const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/;
  return upiRegex.test(upiId);
};
