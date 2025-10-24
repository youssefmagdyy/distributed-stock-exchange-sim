import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const PriceEvolutionChart = ({ priceData }) => {

  const options = {
    responsive: true,
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time'
        },
        grid: {
          display: true
        }
      },
      y: {
        title: {
          display: true,
          text: 'Price'
        },
        grid: {
          display: true
        }
      }
    }
  };
  
  const data = {
    labels: priceData.timestamps,
    datasets: [
      {
        label: 'Average Ask Price',
        data: priceData.askPrices,
        borderColor: 'rgb(207, 51, 51)',
        backgroundColor: 'rgb(207, 51, 51)',
        borderWidth: 1
      },
      {
        label: 'Average Bid Price',
        data: priceData.bidPrices,
        borderColor: 'rgb(11, 152, 51)',
        backgroundColor: 'rgb(11, 152, 51)',
        borderWidth: 1
      }
    ]
  };

  return (
    <div className='price-evolution-container'>
      <h2>Price Evolution</h2>
      <Line data={data} options={options} />
    </div>
  );
};

export default PriceEvolutionChart;
