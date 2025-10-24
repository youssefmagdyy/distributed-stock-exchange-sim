import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement);

const OrderBookChart = ({ orderBookData }) => {

  const sortedAsks = orderBookData.asks.sort((a, b) => a.price - b.price);
  const sortedBids = orderBookData.bids.sort((a, b) => b.price - a.price);
  const askCumulativeQuantity = [];
  let cumulativeAsk = 0;
  sortedAsks.forEach(order => {
    cumulativeAsk += order.quantity;
    askCumulativeQuantity.push(cumulativeAsk);
  });

  const bidCumulativeQuantity = [];
  let cumulativeBid = 0;
  sortedBids.forEach(order => {
    cumulativeBid += order.quantity;
    bidCumulativeQuantity.push(cumulativeBid);
  });

  const labels = [
    ...sortedBids.map(order => order.price),
    ...sortedAsks.map(order => order.price)
  ];

  const data = {
    labels: labels,
    datasets: [
      {
        label: 'Bids',
        data: [
          ...bidCumulativeQuantity,
          ...new Array(sortedAsks.length).fill(0)    // Fill asks with 0 for bids
        ],
        borderColor: 'rgb(11, 152, 51)',
        backgroundColor: 'rgb(11, 152, 51)',
        borderWidth: 1
      },
      {
        label: 'Asks',
        data: [
          ...new Array(sortedBids.length).fill(0),
          ...askCumulativeQuantity
        ],
        borderColor: 'rgb(207, 51, 51)',
        backgroundColor: 'rgb(207, 51, 51)',
        borderWidth: 1
      }
    ]
  };

  const options = {
    responsive: true,
    scales: {
      x: {
        title: {
          display: true,
          text: 'Order Price'
        },
        grid: {
          display: true
        }
      },
      y: {
        title: {
          display: true,
          text: 'Cumulative Amount'
        },
        grid: {
          display: true
        }
      }
    }
  };

  return (
    <div className='order-book-container'>
      <h2>Order Book</h2>
      <Bar data={data} options={options} />
    </div>
  );
};

export default OrderBookChart;
